import React, { useCallback, useState } from 'react'
import { useSelector } from 'react-redux'
import Logo from 'components/Logo'
import Create from './Create'
import FirstRun from './FirstRun'
import SignIn from './SignIn'
import styles from './SignedOutView.css'

const SignedOutView = props => {
  const [isCreating, setCreating] = useState(false)
  const toggleCreate = useCallback(() => setCreating(prevState => !prevState), [])

  const isFirstRun = useSelector(state => state.prefs.isFirstRun === true)
  const ui = useSelector(state => state.ui)

  return (
    <div className={styles.container} style={{ maxWidth: Math.max(340, ui.contentWidth * 0.66) }}>
     <img style={{margin: "auto", display: "block", maxWidth: "100%"}} src="/assets/sb-dc-logo.png"></img>

      {isCreating &&
        <Create onToggle={toggleCreate}/>
      }

      {!isFirstRun && !isCreating &&
        <SignIn onToggle={toggleCreate}/>
      }

      {isFirstRun &&
        <FirstRun/>
      }
      <Logo className={styles.logo}/>
    </div>
  )
}

export default SignedOutView
