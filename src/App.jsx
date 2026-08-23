import { useEffect, useState, useCallback } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import { supabase } from './lib/supabase'
import MySchedule, { getBlocksForDate, formatTimeRange } from './MySchedule'

const STATUS_COLORS = {
  attending: { bg: '#2d4a3a', border: '#1f3428' },
  declined: { bg: '#8b3a3a', border: '#6b2c2c' },
  undecided: { bg: '#9c9184', border: '#7d745f' },
}

const BLOCK_COLORS = {
  unavailable: { bg: '#78716c', border: '#57534e' },
  available: { bg: '#15803d', border: '#166534' },
}

const CHANGELOG = [
  { date: '2026-08-23', text: 'Admins can now view every user\'s current recovery code from the Users list.' },
  { date: '2026-08-23', text: 'Admin account recovery now requires a separate passphrase from the group passphrase.' },
  { date: '2026-08-23', text: 'Added shared-passphrase account recovery for lost codes, and an admin tool to merge duplicate accounts.' },
  { date: '2026-08-23', text: 'New events now automatically post to Discord with the event details and @-mention a role, via a Supabase Edge Function webhook.' },
  { date: '2026-08-23', text: 'Fixed sign-up bug where new users could not create a profile due to a missing recovery code.' },
  { date: '2026-08-23', text: 'Replaced FIFO rosters with a unified schedule blocks system: mark unavailable/available for a single day, date range, or recurring weekday, all-day by default or with specific times.' },
  { date: '2026-08-23', text: 'FIFO rosters used whole-week cycles so fly-out/fly-in always lands on the same weekday. Added holiday date blocking and bulk roster clearing.' },
  { date: '2026-08-23', text: 'Added recurring weekly unavailability and FIFO roster scheduling.' },
  { date: '2026-08-23', text: 'Added multi-device account recovery via recovery codes.' },
  { date: '2026-08-23', text: 'Added user list, event creator visibility, admin moderation, and this changelog.' },
  { date: '2026-08-22', text: "Switched events to all-day only, added RSVP (Attending / Can't go) with color-coded status." },
  { date: '2026-08-22', text: 'Removed group password gate; added anonymous sign-in with editable usernames.' },
  { date: '2026-08-22', text: 'Added background video widget (Subway Surfers / Family Guy / Rick and Morty).' },
  { date: '2026-08-22', text: 'Initial launch: shared calendar with FullCalendar, Supabase, and live sync.' },
]

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [usernameInput, setUsernameInput] = useState('')
  const [usernameError, setUsernameError] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  const [showRecovery, setShowRecovery] = useState(false)
  const [recoveryInput, setRecoveryInput] = useState('')
  const [recoveryError, setRecoveryError] = useState(null)

  const [showPassphraseRecovery, setShowPassphraseRecovery] = useState(false)
  const [recoverUsername, setRecoverUsername] = useState('')
  const [recoverPassphrase, setRecoverPassphrase] = useState('')
  const [recoverError, setRecoverError] = useState(null)

  const [newRecoveryCode, setNewRecoveryCode] = useState(null)
  const [showNewCodeModal, setShowNewCodeModal] = useState(false)

  const [events, setEvents] = useState([])
  const [profiles, setProfiles] = useState([])
  const [rsvps, setRsvps] = useState([])
  const [scheduleBlocks, setScheduleBlocks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createDate, setCreateDate] = useState(null)
  const [newTitle, setNewTitle] = useState('')

  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState(null)

  const [usersModalOpen, setUsersModalOpen] = useState(false)
  const [changelogOpen, setChangelogOpen] = useState(false)
  const [myCodeModalOpen, setMyCodeModalOpen] = useState(false)
  const [myScheduleOpen, setMyScheduleOpen] = useState(false)

  const [mergePrimaryId, setMergePrimaryId] = useState('')
  const [mergeDuplicateId, setMergeDuplicateId] = useState('')
  const [mergeError, setMergeError] = useState(null)
  const [mergeBusy, setMergeBusy] = useState(false)

  const [recoveryCodes, setRecoveryCodes] = useState(null)
  const [recoveryCodesError, setRecoveryCodesError] = useState(null)
  const [recoveryCodesLoading, setRecoveryCodesLoading] = useState(false)

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession()
      if (data.session) {
        setSession(data.session)
      } else {
        const { data: signInData, error: signInError } = await supabase.auth.signInAnonymously()
        if (signInError) setError(signInError.message)
        else setSession(signInData.session)
      }
      setAuthLoading(false)
    }
    init()

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const fetchProfile = useCallback(async () => {
    if (!session) return
    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .contains('auth_user_ids', [session.user.id])
      .maybeSingle()

    if (profileError) setError(profileError.message)
    else setProfile(data)
  }, [session])

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  const generateRecoveryCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let code = ''
    for (let i = 0; i < 8; i++) {
      code += chars[Math.floor(Math.random() * chars.length)]
    }
    return code
  }

  const handleCreateProfile = async (e) => {
    e.preventDefault()
    setUsernameError(null)
    const trimmed = usernameInput.trim()
    if (!trimmed) {
      setUsernameError('Enter a username.')
      return
    }

    const recoveryCode = generateRecoveryCode()

    const { data, error: insertError } = await supabase
      .from('profiles')
      .insert({
        id: session.user.id,
        username: trimmed,
        auth_user_ids: [session.user.id],
        recovery_code: recoveryCode,
      })
      .select()
      .single()

    if (insertError) {
      setUsernameError(insertError.code === '23505' ? 'That username is taken. Try another.' : insertError.message)
      return
    }
    setProfile(data)
    setNewRecoveryCode(data.recovery_code)
    setShowNewCodeModal(true)
  }

  const handleLinkDevice = async (e) => {
    e.preventDefault()
    setRecoveryError(null)
    const trimmed = recoveryInput.trim()
    if (!trimmed) {
      setRecoveryError('Enter your recovery code.')
      return
    }

    const { data, error: rpcError } = await supabase.rpc('link_device_by_code', { input_code: trimmed })

    if (rpcError) {
      setRecoveryError(rpcError.message.includes('Invalid') ? 'Invalid recovery code.' : rpcError.message)
      return
    }

    setProfile(data)
    setShowRecovery(false)
  }

  const handleRecoverByPassphrase = async (e) => {
    e.preventDefault()
    setRecoverError(null)
    const trimmedUsername = recoverUsername.trim()
    const trimmedPassphrase = recoverPassphrase.trim()
    if (!trimmedUsername || !trimmedPassphrase) {
      setRecoverError('Enter your username and the group passphrase.')
      return
    }

    const { data, error: rpcError } = await supabase.rpc('recover_account_by_passphrase', {
      input_username: trimmedUsername,
      input_passphrase: trimmedPassphrase,
    })

    if (rpcError) {
      setRecoverError(
        rpcError.message.includes('Invalid passphrase')
          ? 'Incorrect passphrase.'
          : rpcError.message.includes('No account found')
          ? 'No account found with that username.'
          : rpcError.message
      )
      return
    }

    setProfile(data)
    setNewRecoveryCode(data.recovery_code)
    setShowNewCodeModal(true)
    setShowPassphraseRecovery(false)
    setShowRecovery(false)
  }

  const handleRename = async (newUsername) => {
    const trimmed = newUsername.trim()
    if (!trimmed || trimmed === profile.username) return

    const { data, error: updateError } = await supabase
      .from('profiles')
      .update({ username: trimmed })
      .eq('id', profile.id)
      .select()
      .single()

    if (updateError) {
      setError(updateError.code === '23505' ? 'That username is taken.' : updateError.message)
    } else {
      setProfile(data)
    }
  }

  const fetchAll = useCallback(async () => {
    if (!profile) return
    setLoading(true)

    const [eventsRes, rsvpsRes, profilesRes, blocksRes] = await Promise.all([
      supabase.from('events').select('*').order('event_date', { ascending: true }),
      supabase.from('rsvps').select('*'),
      supabase.from('profiles').select('*'),
      supabase.from('schedule_blocks').select('*'),
    ])

    if (eventsRes.error) setError(eventsRes.error.message)
    else setEvents(eventsRes.data)

    if (rsvpsRes.error) setError(rsvpsRes.error.message)
    else setRsvps(rsvpsRes.data)

    if (profilesRes.error) setError(profilesRes.error.message)
    else setProfiles(profilesRes.data)

    if (blocksRes.error) setError(blocksRes.error.message)
    else setScheduleBlocks(blocksRes.data)

    setLoading(false)
  }, [profile])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  useEffect(() => {
    if (!profile) return
    const channel = supabase
      .channel('calendar-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rsvps' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_blocks' }, () => fetchAll())
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [profile, fetchAll])

  const handleDateClick = (info) => {
    setCreateDate(info.dateStr)
    setNewTitle('')
    setCreateModalOpen(true)
  }

  const closeCreateModal = () => {
    setCreateModalOpen(false)
    setCreateDate(null)
  }

  const handleCreateEvent = async (e) => {
    e.preventDefault()
    if (!newTitle.trim()) {
      setError('Title is required.')
      return
    }

    const { error: insertError } = await supabase.from('events').insert({
      title: newTitle.trim(),
      event_date: createDate,
      user_id: profile.id,
    })

    if (insertError) {
      setError(insertError.message)
      return
    }

    setError(null)
    closeCreateModal()
    fetchAll()
  }

  const myRsvpFor = (eventId) => rsvps.find((r) => r.event_id === eventId && r.user_id === profile?.id)

  const statusFor = (eventId) => {
    const mine = myRsvpFor(eventId)
    return mine ? mine.status : 'undecided'
  }

  const attendeesFor = (eventId) => {
    const attending = rsvps.filter((r) => r.event_id === eventId && r.status === 'attending')
    const declined = rsvps.filter((r) => r.event_id === eventId && r.status === 'declined')
    return { attending, declined }
  }

  const handleEventClick = (info) => {
    if (info.event.extendedProps.isSchedule) return
    const ev = events.find((e) => e.id === info.event.id)
    if (ev) {
      setSelectedEvent(ev)
      setDetailModalOpen(true)
    }
  }

  const closeDetailModal = () => {
    setDetailModalOpen(false)
    setSelectedEvent(null)
  }

  const handleSetRsvp = async (status) => {
    if (!selectedEvent) return
    const existing = myRsvpFor(selectedEvent.id)

    if (existing) {
      const { error: updateError } = await supabase
        .from('rsvps')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
      if (updateError) setError(updateError.message)
    } else {
      const { error: insertError } = await supabase
        .from('rsvps')
        .insert({ event_id: selectedEvent.id, user_id: profile.id, status })
      if (insertError) setError(insertError.message)
    }
    fetchAll()
  }

  const handleClearRsvp = async () => {
    if (!selectedEvent) return
    const existing = myRsvpFor(selectedEvent.id)
    if (!existing) return

    const { error: deleteError } = await supabase.from('rsvps').delete().eq('id', existing.id)
    if (deleteError) setError(deleteError.message)
    fetchAll()
  }

  const handleDeleteEvent = async () => {
    if (!selectedEvent) return
    const isOwner = profile && selectedEvent.user_id === profile.id
    const isAdmin = profile?.is_admin
    if (!isOwner && !isAdmin) return

    const confirmDelete = window.confirm(`Delete "${selectedEvent.title}"?`)
    if (!confirmDelete) return

    const { error: deleteError } = await supabase.from('events').delete().eq('id', selectedEvent.id)
    if (deleteError) setError(deleteError.message)
    else {
      closeDetailModal()
      fetchAll()
    }
  }

  const usernameFor = (userId) => {
    const p = profiles.find((pr) => pr.id === userId)
    return p ? p.username : 'Unknown'
  }

  const handleMergeProfiles = async () => {
    setMergeError(null)
    if (!mergePrimaryId || !mergeDuplicateId) {
      setMergeError('Choose both a primary and a duplicate account.')
      return
    }
    if (mergePrimaryId === mergeDuplicateId) {
      setMergeError('Primary and duplicate must be different accounts.')
      return
    }

    const primaryName = usernameFor(mergePrimaryId)
    const duplicateName = usernameFor(mergeDuplicateId)
    const confirmMerge = window.confirm(
      `Merge "${duplicateName}" into "${primaryName}"? All events, RSVPs, and schedule blocks from "${duplicateName}" will move to "${primaryName}", and "${duplicateName}" will be deleted. This cannot be undone.`
    )
    if (!confirmMerge) return

    setMergeBusy(true)
    const { error: mergeErr } = await supabase.rpc('merge_duplicate_profile', {
      primary_profile_id: mergePrimaryId,
      duplicate_profile_id: mergeDuplicateId,
    })
    setMergeBusy(false)

    if (mergeErr) {
      setMergeError(mergeErr.message)
      return
    }

    setMergePrimaryId('')
    setMergeDuplicateId('')
    fetchAll()
  }

  const handleLoadRecoveryCodes = async () => {
    setRecoveryCodesError(null)
    setRecoveryCodesLoading(true)
    const { data, error: rpcError } = await supabase.rpc('admin_list_recovery_codes')
    setRecoveryCodesLoading(false)

    if (rpcError) {
      setRecoveryCodesError(rpcError.message)
      return
    }
    setRecoveryCodes(data)
  }

  const eventCalendarItems = events.map((ev) => {
    const status = statusFor(ev.id)
    return {
      id: ev.id,
      title: ev.title,
      start: ev.event_date,
      allDay: true,
      backgroundColor: STATUS_COLORS[status].bg,
      borderColor: STATUS_COLORS[status].border,
    }
  })

  const scheduleCalendarItems = []
  const rangeStart = new Date()
  rangeStart.setMonth(rangeStart.getMonth() - 1)
  const rangeEnd = new Date()
  rangeEnd.setMonth(rangeEnd.getMonth() + 3)

  const uniqueUserIds = [...new Set(scheduleBlocks.map((b) => b.user_id))]

  for (let d = new Date(rangeStart); d <= rangeEnd; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0]

    uniqueUserIds.forEach((userId) => {
      const blocksToday = getBlocksForDate(scheduleBlocks, userId, dateStr)
      blocksToday.forEach((block) => {
        const timeLabel = formatTimeRange(block)
        scheduleCalendarItems.push({
          id: `block-${block.id}-${dateStr}`,
          title: `${block.label} (${usernameFor(userId)})${block.all_day ? '' : ` ${timeLabel}`}`,
          start: dateStr,
          allDay: true,
          backgroundColor: BLOCK_COLORS[block.status].bg,
          borderColor: BLOCK_COLORS[block.status].border,
          extendedProps: { isSchedule: true },
        })
      })
    })
  }

  const calendarEvents = [...eventCalendarItems, ...scheduleCalendarItems]

  if (authLoading) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center">
        <p className="text-stone-500 text-sm">Loading...</p>
      </div>
    )
  }

  if (session && !profile) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-sm border border-stone-200 p-8 w-full max-w-sm">
          {!showRecovery && !showPassphraseRecovery ? (
            <>
              <h1 className="text-xl font-bold text-stone-800 mb-1">Pick a username</h1>
              <p className="text-sm text-stone-500 mb-6">This is how your friends will see you. You can change it anytime.</p>
              <form onSubmit={handleCreateProfile}>
                <input
                  type="text"
                  required
                  autoFocus
                  maxLength={24}
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  placeholder="Enter a username"
                  className="w-full border border-stone-300 rounded-md px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
                {usernameError && <p className="text-sm text-red-600 mb-3">{usernameError}</p>}
                <button type="submit" className="w-full bg-emerald-800 text-white text-sm font-medium py-2 rounded-md hover:bg-emerald-900 transition">
                  Continue
                </button>
              </form>
              <button
                onClick={() => { setShowRecovery(true); setRecoveryError(null) }}
                className="w-full text-center text-xs text-stone-500 hover:text-stone-700 underline mt-4 transition"
              >
                Already have an account? Enter your recovery code
              </button>
              <button
                onClick={() => { setShowPassphraseRecovery(true); setRecoverError(null) }}
                className="w-full text-center text-xs text-stone-500 hover:text-stone-700 underline mt-2 transition"
              >
                Forgot your code?
              </button>
            </>
          ) : showRecovery ? (
            <>
              <h1 className="text-xl font-bold text-stone-800 mb-1">Enter recovery code</h1>
              <p className="text-sm text-stone-500 mb-6">Use the code you saved when you first created your account.</p>
              <form onSubmit={handleLinkDevice}>
                <input
                  type="text"
                  required
                  autoFocus
                  maxLength={10}
                  value={recoveryInput}
                  onChange={(e) => setRecoveryInput(e.target.value.toUpperCase())}
                  placeholder="Enter your code"
                  className="w-full border border-stone-300 rounded-md px-3 py-2 text-sm mb-3 font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
                {recoveryError && <p className="text-sm text-red-600 mb-3">{recoveryError}</p>}
                <button type="submit" className="w-full bg-emerald-800 text-white text-sm font-medium py-2 rounded-md hover:bg-emerald-900 transition">
                  Link this device
                </button>
              </form>
              <button
                onClick={() => { setShowRecovery(false); setRecoveryError(null) }}
                className="w-full text-center text-xs text-stone-500 hover:text-stone-700 underline mt-4 transition"
              >
                New here? Pick a username instead
              </button>
              <button
                onClick={() => { setShowRecovery(false); setShowPassphraseRecovery(true); setRecoverError(null) }}
                className="w-full text-center text-xs text-stone-500 hover:text-stone-700 underline mt-2 transition"
              >
                Forgot your code?
              </button>
            </>
          ) : (
            <>
              <h1 className="text-xl font-bold text-stone-800 mb-1">Forgot your code?</h1>
              <p className="text-sm text-stone-500 mb-6">
                Enter your username and the group passphrase to get a new recovery code for your account.
              </p>
              <form onSubmit={handleRecoverByPassphrase}>
                <input
                  type="text"
                  required
                  autoFocus
                  maxLength={24}
                  value={recoverUsername}
                  onChange={(e) => setRecoverUsername(e.target.value)}
                  placeholder="Your username"
                  className="w-full border border-stone-300 rounded-md px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
                <input
                  type="password"
                  required
                  maxLength={32}
                  value={recoverPassphrase}
                  onChange={(e) => setRecoverPassphrase(e.target.value)}
                  placeholder="Group passphrase"
                  className="w-full border border-stone-300 rounded-md px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
                {recoverError && <p className="text-sm text-red-600 mb-3">{recoverError}</p>}
                <button type="submit" className="w-full bg-emerald-800 text-white text-sm font-medium py-2 rounded-md hover:bg-emerald-900 transition">
                  Recover my account
                </button>
              </form>
              <button
                onClick={() => { setShowPassphraseRecovery(false); setRecoverError(null) }}
                className="w-full text-center text-xs text-stone-500 hover:text-stone-700 underline mt-4 transition"
              >
                Back
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  if (showNewCodeModal && newRecoveryCode) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-sm border border-stone-200 p-8 w-full max-w-sm text-center">
          <h1 className="text-xl font-bold text-stone-800 mb-1">Save your recovery code</h1>
          <p className="text-sm text-stone-500 mb-4">
            You'll need this to log in on other devices. It won't be shown again.
          </p>
          <p className="font-mono text-lg tracking-widest bg-stone-100 border border-stone-300 rounded-md py-3 mb-4 select-all">
            {newRecoveryCode}
          </p>
          <button
            onClick={() => setShowNewCodeModal(false)}
            className="w-full bg-emerald-800 text-white text-sm font-medium py-2 rounded-md hover:bg-emerald-900 transition"
          >
            I've saved it, continue
          </button>
        </div>
      </div>
    )
  }

  const myStatus = selectedEvent ? statusFor(selectedEvent.id) : 'undecided'
  const { attending, declined } = selectedEvent ? attendeesFor(selectedEvent.id) : { attending: [], declined: [] }
  const isEventOwner = selectedEvent && profile && selectedEvent.user_id === profile.id
  const isAdmin = profile?.is_admin
  const canDelete = isEventOwner || isAdmin

  return (
    <div className="min-h-screen bg-stone-100 p-4 md:p-8 pb-16">
      <header className="max-w-6xl mx-auto mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-800">
            Group Calendar
            {isAdmin && <span className="ml-2 text-xs bg-amber-800 text-white px-2 py-0.5 rounded-full align-middle">Admin</span>}
          </h1>
          <p className="text-sm text-stone-500">Click a day to add an event. Click an event to RSVP.</p>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <button
            onClick={() => setMyScheduleOpen(true)}
            className="text-sm px-3 py-1.5 rounded-md bg-emerald-800 text-white hover:bg-emerald-900 transition"
          >
            My schedule
          </button>

          <button
            onClick={() => setMyCodeModalOpen(true)}
            className="text-sm px-3 py-1.5 rounded-md bg-stone-200 hover:bg-stone-300 transition"
          >
            My code
          </button>

          <button
            onClick={() => setUsersModalOpen(true)}
            className="text-sm px-3 py-1.5 rounded-md bg-stone-200 hover:bg-stone-300 transition"
          >
            Users ({profiles.length})
          </button>

          {profile && <UsernameEditor username={profile.username} onSave={handleRename} />}
        </div>
      </header>

      <div className="max-w-6xl mx-auto mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
        <span><span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-900 mr-1" />Attending</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-full bg-red-800 mr-1" />Declined</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-full bg-stone-400 mr-1" />Undecided</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-full bg-stone-600 mr-1" />Unavailable</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-full bg-green-700 mr-1" />Available</span>
      </div>

      {error && (
        <div className="max-w-6xl mx-auto mb-4 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">
          {error}
        </div>
      )}

      <main className="max-w-6xl mx-auto bg-white rounded-xl shadow-sm border border-stone-200 p-4">
        {loading ? (
          <p className="text-stone-500 text-sm p-4">Loading calendar...</p>
        ) : (
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth' }}
            dayMaxEvents={true}
            height="auto"
            events={calendarEvents}
            dateClick={handleDateClick}
            eventClick={handleEventClick}
          />
        )}
      </main>

      {createModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-stone-800 mb-4">
              New event - {new Date(createDate + 'T00:00:00').toLocaleDateString(undefined, { dateStyle: 'medium' })}
            </h2>
            <form onSubmit={handleCreateEvent} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Title</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full border border-stone-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  placeholder="e.g. Board game night"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeCreateModal} className="px-4 py-2 text-sm rounded-md bg-stone-100 hover:bg-stone-200 transition">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 text-sm rounded-md bg-emerald-800 text-white hover:bg-emerald-900 transition">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {detailModalOpen && selectedEvent && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-stone-800 mb-1">{selectedEvent.title}</h2>
            <p className="text-sm text-stone-500">
              {new Date(selectedEvent.event_date + 'T00:00:00').toLocaleDateString(undefined, { dateStyle: 'full' })}
            </p>
            <p className="text-xs text-stone-400 mb-4">Created by {usernameFor(selectedEvent.user_id)}</p>

            <div className="flex gap-2 mb-4">
              <button
                onClick={() => handleSetRsvp('attending')}
                className={`flex-1 px-3 py-2 text-sm rounded-md transition ${myStatus === 'attending' ? 'bg-emerald-800 text-white' : 'bg-stone-100 hover:bg-stone-200'}`}
              >
                Attending
              </button>
              <button
                onClick={() => handleSetRsvp('declined')}
                className={`flex-1 px-3 py-2 text-sm rounded-md transition ${myStatus === 'declined' ? 'bg-red-800 text-white' : 'bg-stone-100 hover:bg-stone-200'}`}
              >
                Can't go
              </button>
              {myStatus !== 'undecided' && (
                <button onClick={handleClearRsvp} className="px-3 py-2 text-sm rounded-md bg-stone-50 hover:bg-stone-100 border border-stone-200 transition">
                  Reset
                </button>
              )}
            </div>

            <div className="mb-4">
              <p className="text-xs font-medium text-stone-500 mb-1">Attending ({attending.length})</p>
              <p className="text-sm text-stone-700">
                {attending.length ? attending.map((r) => usernameFor(r.user_id)).join(', ') : 'Nobody yet'}
              </p>
            </div>

            <div className="mb-6">
              <p className="text-xs font-medium text-stone-500 mb-1">Declined ({declined.length})</p>
              <p className="text-sm text-stone-700">
                {declined.length ? declined.map((r) => usernameFor(r.user_id)).join(', ') : 'Nobody'}
              </p>
            </div>

            <div className="flex justify-between items-center">
              {canDelete ? (
                <button onClick={handleDeleteEvent} className="text-sm text-red-600 hover:text-red-800 transition">
                  {isAdmin && !isEventOwner ? 'Delete (admin)' : 'Delete event'}
                </button>
              ) : <span />}
              <button onClick={closeDetailModal} className="px-4 py-2 text-sm rounded-md bg-stone-100 hover:bg-stone-200 transition">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {usersModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 max-h-[85vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-stone-800 mb-4">Users ({profiles.length})</h2>
            <ul className="space-y-2 max-h-64 overflow-y-auto mb-4">
              {profiles.map((p) => (
                <li key={p.id} className="flex items-center justify-between text-sm text-stone-700 border-b border-stone-100 pb-2">
                  <span>{p.username}</span>
                  {p.is_admin && <span className="text-xs bg-amber-800 text-white px-2 py-0.5 rounded-full">Admin</span>}
                </li>
              ))}
            </ul>

            {isAdmin && (
              <div className="border-t border-stone-200 pt-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-stone-800">Recovery codes</h3>
                  <button
                    onClick={recoveryCodes ? () => setRecoveryCodes(null) : handleLoadRecoveryCodes}
                    className="text-xs px-2 py-1 rounded-md bg-stone-100 hover:bg-stone-200 transition"
                  >
                    {recoveryCodesLoading ? 'Loading...' : recoveryCodes ? 'Hide' : 'Show recovery codes'}
                  </button>
                </div>
                {recoveryCodesError && <p className="text-sm text-red-600 mb-2">{recoveryCodesError}</p>}
                {recoveryCodes && (
                  <ul className="space-y-1 max-h-48 overflow-y-auto border border-stone-200 rounded-md p-2">
                    {recoveryCodes.map((r) => (
                      <li key={r.id} className="flex items-center justify-between text-xs text-stone-700">
                        <span>{r.username}{r.is_admin ? ' (admin)' : ''}</span>
                        <span className="font-mono tracking-wider select-all">{r.recovery_code}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {isAdmin && (
              <div className="border-t border-stone-200 pt-4 mb-4">
                <h3 className="text-sm font-semibold text-stone-800 mb-1">Merge duplicate accounts</h3>
                <p className="text-xs text-stone-500 mb-3">
                  Moves all events, RSVPs, and schedule blocks from the duplicate into the primary account, then deletes the duplicate.
                </p>
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs font-medium text-stone-600 mb-1">Primary account (keep this one)</label>
                    <select
                      value={mergePrimaryId}
                      onChange={(e) => setMergePrimaryId(e.target.value)}
                      className="w-full border border-stone-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                    >
                      <option value="">Select primary account</option>
                      {profiles.map((p) => (
                        <option key={p.id} value={p.id}>{p.username}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-600 mb-1">Duplicate account (will be deleted)</label>
                    <select
                      value={mergeDuplicateId}
                      onChange={(e) => setMergeDuplicateId(e.target.value)}
                      className="w-full border border-stone-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                    >
                      <option value="">Select duplicate account</option>
                      {profiles.map((p) => (
                        <option key={p.id} value={p.id}>{p.username}</option>
                      ))}
                    </select>
                  </div>
                  {mergeError && <p className="text-sm text-red-600">{mergeError}</p>}
                  <button
                    onClick={handleMergeProfiles}
                    disabled={mergeBusy}
                    className="w-full bg-red-700 text-white text-sm font-medium py-2 rounded-md hover:bg-red-800 transition disabled:opacity-50"
                  >
                    {mergeBusy ? 'Merging...' : 'Merge accounts'}
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => { setUsersModalOpen(false); setRecoveryCodes(null); setRecoveryCodesError(null) }}
                className="px-4 py-2 text-sm rounded-md bg-stone-100 hover:bg-stone-200 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {myCodeModalOpen && profile && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 text-center">
            <h2 className="text-lg font-semibold text-stone-800 mb-1">Your recovery code</h2>
            <p className="text-sm text-stone-500 mb-4">Use this to log in as {profile.username} on another device.</p>
            <p className="font-mono text-lg tracking-widest bg-stone-100 border border-stone-300 rounded-md py-3 mb-4 select-all">
              {profile.recovery_code}
            </p>
            <button onClick={() => setMyCodeModalOpen(false)} className="w-full px-4 py-2 text-sm rounded-md bg-stone-100 hover:bg-stone-200 transition">
              Close
            </button>
          </div>
        </div>
      )}

      {myScheduleOpen && profile && (
        <MySchedule
          profile={profile}
          onClose={() => setMyScheduleOpen(false)}
          onSaved={fetchAll}
        />
      )}

      <ChangelogButton open={changelogOpen} setOpen={setChangelogOpen} />
      <BrainrotWidget />
    </div>
  )
}

function UsernameEditor({ username, onSave }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(username)

  if (!editing) {
    return (
      <button onClick={() => { setValue(username); setEditing(true) }} className="text-sm text-stone-600 hover:text-stone-900 transition underline decoration-dotted">
        {username}
      </button>
    )
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(value); setEditing(false) }} className="flex items-center gap-2">
      <input
        type="text"
        autoFocus
        maxLength={24}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="text-sm border border-stone-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-700"
      />
      <button type="submit" className="text-sm px-2 py-1 rounded-md bg-emerald-800 text-white hover:bg-emerald-900 transition">Save</button>
      <button type="button" onClick={() => setEditing(false)} className="text-sm px-2 py-1 rounded-md bg-stone-100 hover:bg-stone-200 transition">Cancel</button>
    </form>
  )
}

function ChangelogButton({ open, setOpen }) {
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-4 z-40 text-xs px-3 py-1.5 rounded-full bg-stone-800 text-white shadow-md hover:bg-stone-900 transition"
      >
        What's new
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 max-h-[80vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-stone-800 mb-4">Changelog</h2>
            <ul className="space-y-3">
              {CHANGELOG.map((entry, i) => (
                <li key={i} className="border-b border-stone-100 pb-3 last:border-0">
                  <p className="text-xs text-stone-400 mb-0.5">{entry.date}</p>
                  <p className="text-sm text-stone-700">{entry.text}</p>
                </li>
              ))}
            </ul>
            <div className="flex justify-end pt-4">
              <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm rounded-md bg-stone-100 hover:bg-stone-200 transition">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function BrainrotWidget() {
  const [videoKey, setVideoKey] = useState('subway')
  const [minimized, setMinimized] = useState(false)

  const VIDEOS = { subway: 'eRXE8Aebp7s', familyguy: 'pLSy_xMBKHY', rickmorty: 'VBZ-_ICc4dQ' }
  const LABELS = { subway: 'Subway Surfers', familyguy: 'Family Guy', rickmorty: 'Rick and Morty' }
  const embedSrc = `https://www.youtube.com/embed/${VIDEOS[videoKey]}?autoplay=1&mute=1&loop=1&playlist=${VIDEOS[videoKey]}&controls=1`

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
      {!minimized && (
        <div className="bg-black rounded-lg shadow-xl overflow-hidden border border-stone-300" style={{ width: 320, height: 180 }}>
          <iframe key={videoKey} width="320" height="180" src={embedSrc} title="Background video" frameBorder="0" allow="autoplay; encrypted-media" allowFullScreen />
        </div>
      )}
      <div className="bg-white rounded-md shadow-md border border-stone-200 px-2 py-1.5 flex items-center gap-2">
        <select value={videoKey} onChange={(e) => setVideoKey(e.target.value)} className="text-xs border border-stone-300 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-700">
          {Object.keys(VIDEOS).map((key) => <option key={key} value={key}>{LABELS[key]}</option>)}
        </select>
        <button onClick={() => setMinimized((m) => !m)} className="text-xs px-2 py-1 rounded bg-stone-100 hover:bg-stone-200 transition">
          {minimized ? 'Show' : 'Hide'}
        </button>
      </div>
    </div>
  )
}
