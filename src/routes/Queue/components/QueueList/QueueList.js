import React, { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { ensureState } from 'redux-optimistic-ui'
import QueueItem from '../QueueItem'
import QueueYoutubeItem from '../QueueYoutubeItem'
import QueueListAnimator from '../QueueListAnimator'
import { formatSeconds } from 'lib/dateTime'

import { moveItem } from '../../modules/queue'

import getPlayerHistory from '../../selectors/getPlayerHistory'
import getRoundRobinQueue from '../../selectors/getRoundRobinQueue'
import getWaits from '../../selectors/getWaits'

const QueueList = props => {
  const artists = useSelector(state => state.artists)
  const { errorMessage, isAtQueueEnd, isErrored, position, queueId } = useSelector(state => state.status)

  const playerHistory = useSelector(getPlayerHistory)
  const queue = useSelector(getRoundRobinQueue)
  const songs = useSelector(state => state.songs)
  const starredSongs = useSelector(state => ensureState(state.userStars).starredSongs)
  const user = useSelector(state => state.user)
  const waits = useSelector(getWaits)

  // actions
  const dispatch = useDispatch()
  const handleMoveClick = useCallback(qId => {
    // reference user's last-played item as the new prevQueueId
    const userId = queue.entities[qId].userId
    let lastPlayed = queueId // default in case user has no played items

    for (let i = queue.result.indexOf(queueId); i >= 0; i--) {
      if (queue.entities[queue.result[i]].userId === userId) {
        lastPlayed = queue.result[i]
        break
      }
    }

    dispatch(moveItem(qId, lastPlayed))
  }, [dispatch, queueId, queue.entities, queue.result])

  // build children array
  const items = queue.result.map(qId => {
    const item = queue.entities[qId]

    if (item.isOptimistic) return null

    if (item.youtubeVideoId) {
      if (!item.youtubeVideoStatus) return null

      const isCurrent = (queueId === props.queueId) && !props.isAtQueueEnd
      const isUpcoming = queueId !== props.queueId && !props.playerHistory.includes(queueId)
      const isOwner = item.userId === props.user.userId

      return (
        <CSSTransition
          key={queueId}
          timeout={800}
          unmountOnExit={false}
          classNames={{
            appear: '',
            appearActive: '',
            enter: styles.fadeEnter,
            enterActive: styles.fadeEnterActive,
            exit: styles.itemExit,
            exitActive: styles.itemExitActive,
          }}
        >
          <QueueYoutubeItem {...item}
            artist={item.youtubeVideoArtist}
            errorMessage={isCurrent && props.errorMessage ? props.errorMessage : ''}
            isCurrent={isCurrent}
            isErrored={isCurrent && props.isErrored}
            isOwner={isOwner}
            isPlayed={!isUpcoming && !isCurrent}
            isRemovable={isUpcoming && (isOwner || props.user.isAdmin)}
            isSkippable={isCurrent && (isOwner || props.user.isAdmin)}
            isUpcoming={isUpcoming}
            pctPlayed={isCurrent ? props.position / item.youtubeVideoDuration * 100 : 0}
            title={item.youtubeVideoTitle}
            wait={formatSeconds(props.waits[queueId], true)} // fuzzy
            status={item.youtubeVideoStatus}
            // actions
            onErrorInfoClick={props.showErrorMessage}
            onRemoveClick={props.removeItem}
            onSkipClick={props.requestPlayNext}
          />
        </CSSTransition>
      )
    }

    if (!props.songs.entities[item.songId] ||
      !props.artists.entities[props.songs.entities[item.songId].artistId]) return null
      
    const duration = songs.entities[item.songId].duration
    const isCurrent = (qId === queueId) && !isAtQueueEnd
    const isUpcoming = qId !== queueId && !playerHistory.includes(qId)
    const isOwner = item.userId === user.userId

    return (
      <QueueItem
        {...item}
        artist={artists.entities[songs.entities[item.songId].artistId].name}
        errorMessage={isCurrent && errorMessage ? errorMessage : ''}
        isCurrent={isCurrent}
        key={qId}
        isErrored={isCurrent && isErrored}
        isInfoable={user.isAdmin}
        isMovable={isUpcoming && (isOwner || user.isAdmin)}
        isOwner={isOwner}
        isPlayed={!isUpcoming && !isCurrent}
        isRemovable={isUpcoming && (isOwner || user.isAdmin)}
        isSkippable={isCurrent && (isOwner || user.isAdmin)}
        isStarred={starredSongs.includes(item.songId)}
        isUpcoming={isUpcoming}
        pctPlayed={isCurrent ? position / duration * 100 : 0}
        title={songs.entities[item.songId].title}
        wait={formatSeconds(waits[qId], true)} // fuzzy
        // actions
        onMoveClick={handleMoveClick}
      />
    )
  })

  return (
    <QueueListAnimator>
      {items}
    </QueueListAnimator>
  )
}

export default QueueList
