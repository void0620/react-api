const Queue = require('./Queue')
const Rooms = require('../Rooms')
const Media = require('../Media')
const YoutubeProcessManager = require('../Youtube/YoutubeProcessManager')

const {
  QUEUE_ADD,
  QUEUE_MOVE,
  QUEUE_REMOVE,
  QUEUE_PUSH,
} = require('../../shared/actionTypes')

// ------------------------------------
// Action Handlers
// ------------------------------------
const ACTION_HANDLERS = {
  [QUEUE_ADD]: async (sock, { payload }, acknowledge) => {
    const { songId } = payload

    try {
      await Rooms.validate(sock.user.roomId, null, { validatePassword: false })
    } catch (err) {
      return acknowledge({
        type: QUEUE_ADD + '_ERROR',
        error: err.message,
      })
    }

    await Queue.add({
      roomId: sock.user.roomId,
      songId,
      userId: sock.user.userId,
      youtubeVideoId: payload.youtubeVideoId
    })

    // if this is a youtube video, also insert the details into the youtubeVideos table...
    if (payload.youtubeVideoId) {
      // see if it is already in the database...
      const youtubeCheckQuery = sql`
        SELECT *
        FROM youtubeVideos
        WHERE youtubeVideoId = ${payload.youtubeVideoId}
      `
      const rows = await db.all(String(youtubeCheckQuery), youtubeCheckQuery.parameters)

      // if this youtube video is already in the database, we might want to use it as-is...
      let processVideo = true
      if (rows.length) {
        let video = null
        if (rows.length === 1) {
          video = rows[0]
        }

        // if the video failed (or somehow we have multiple videos), delete and re-process from scratch...
        if (video === null || video.status === 'failed') {
          const deleteQuery = sql`
            DELETE FROM youtubeVideos
            WHERE youtubeVideoId = ${payload.youtubeVideoId}
          `
          const deleteRes = await db.run(String(deleteQuery), deleteQuery.parameters)

          if (!deleteRes.changes) {
            sock.emit('toast', {
              content:'This video had already failed, and we couldn\'t retry it. Let your host know something\'s wrong.',
              type:'error'
            })
            return
          }
        } else { // if the video is still processing, just send a message with the status...
          processVideo = false
          sock.emit('toast', { content:'😎 This video is already ' + video.status + '!' })
        }
      }

      if (processVideo) { // if this youtube video is not in the database yet, we'll want to process it...
        const youtubeInsertFields = new Map()
        youtubeInsertFields.set('youtubeVideoId', payload.youtubeVideoId)
        youtubeInsertFields.set('userId', sock.user.userId)
        youtubeInsertFields.set('thumbnail', payload.thumbnail)
        youtubeInsertFields.set('url', payload.url)
        youtubeInsertFields.set('duration', payload.duration)
        youtubeInsertFields.set('artist', payload.artist)
        youtubeInsertFields.set('title', payload.title)
        youtubeInsertFields.set('lyrics', payload.lyrics)
        youtubeInsertFields.set('karaoke', payload.karaoke)
        youtubeInsertFields.set('status', 'pending')

        const youtubeInsertQuery = sql`
          INSERT INTO youtubeVideos ${sql.tuple(Array.from(youtubeInsertFields.keys()).map(sql.column))}
          VALUES ${sql.tuple(Array.from(youtubeInsertFields.values()))}
        `
        const youtubeInsertRes = await db.run(String(youtubeInsertQuery), youtubeInsertQuery.parameters)

        if (youtubeInsertRes.changes !== 1) {
          throw new Error('Could not add YouTube video')
        }
      }

      // and make sure the youtube processor is running...
      YoutubeProcessManager.startYoutubeProcessor()
    }

    // success
    acknowledge({ type: QUEUE_ADD + '_SUCCESS' })

    // to all in room
    sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
      type: QUEUE_PUSH,
      payload: await Queue.get(sock.user.roomId)
    })
  },
  [QUEUE_MOVE]: async (sock, { payload }, acknowledge) => {
    const { queueId, prevQueueId } = payload

    try {
      await Rooms.validate(sock.user.roomId, null, { validatePassword: false })
    } catch (err) {
      return acknowledge({
        type: QUEUE_MOVE + '_ERROR',
        error: err.message,
      })
    }

    let whereClause = sql`queueId = ${payload.queueId} AND roomId = ${sock.user.roomId}`

    // get the queued item first...
    const queueQuery = sql`
      SELECT *
      FROM queue
      WHERE ${whereClause}
      `
    const queueItem = await db.get(String(queueQuery), queueQuery.parameters)

    if (!sock.user.isAdmin && !await Queue.isOwner(sock.user.userId, queueId)) {
      whereClause = sql`${whereClause} AND userId = ${sock.user.userId}`
      return acknowledge({
        type: QUEUE_MOVE + '_ERROR',
        error: 'Cannot move another user\'s song',
      })
    }

    await Queue.move({
      prevQueueId,
      queueId,
      roomId: sock.user.roomId,
    })

    // if we had gotten the queued item successfully and it has an associated youtube video...
    if (queueItem && queueItem.youtubeVideoId) {
      // lookup the youtube video item...
      const youtubeQuery = sql`
      SELECT *
      FROM youtubeVideos
      WHERE youtubeVideoId = ${queueItem.youtubeVideoId}
      `
      const video = await db.get(String(youtubeQuery), youtubeQuery.parameters)

      // if we found the youtube video item, trigger an update on it. This will cause
      // it to be deleted and cleaned up if it's no longer queued anywhere...
      if (video) {
        Media.updateYoutubeVideo({ video }, io)
      }
    }
    
    // success
    acknowledge({ type: QUEUE_MOVE + '_SUCCESS' })

    // tell room
    sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
      type: QUEUE_PUSH,
      payload: await Queue.get(sock.user.roomId)
    })
  },
  [QUEUE_REMOVE]: async (sock, { payload }, acknowledge) => {
    const { queueId } = payload

    if (!sock.user.isAdmin && !await Queue.isOwner(sock.user.userId, queueId)) {
      return acknowledge({
        type: QUEUE_REMOVE + '_ERROR',
        error: 'Cannot remove another user\'s song',
      })
    }

    await Queue.remove(queueId)

    // success
    acknowledge({ type: QUEUE_REMOVE + '_SUCCESS' })

    // tell room
    sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
      type: QUEUE_PUSH,
      payload: await Queue.get(sock.user.roomId)
    })
  },
}

module.exports = ACTION_HANDLERS
