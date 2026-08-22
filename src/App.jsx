import { useEffect, useState, useCallback } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import { supabase } from './lib/supabase'

const STATUS_COLORS = {
  attending: { bg: '#2d4a3a', border: '#1f3428' },
  declined: { bg: '#8b3a3a', border: '#6b2c2c' },
  undecided: { bg: '#9c9184', border: '#7d745f' },
}

const CHANGELOG = [
  { date: '2026-08-23', text: 'Added user list, event creator visibility, admin moderation, and this changelog.' },
  { date: '2026-08-22', text: 'Switched events to all-day only, added RSVP (Attending / Can\'t go) with color-coded status.' },
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

  const [events, setEvents] = useState([])
  const [profiles, setProfiles] = useState([])
  const [rsvps, setRsvps] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createDate, setCreateDate] = useState(null)
  const [newTitle, setNewTitle] = useState('')

  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState(null)

  const [usersModalOpen, setUsersModalOpen] = useState(false)
  const [changelogOpen, setChangelogOpen] = useState(false)

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
      .eq('id', session.user.id)
      .maybeSingle()

    if (profileError) setError(profileError.message)
    else setProfile(data)
  }, [session])

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  const handleCreateProfile = async (e) => {
    e.preventDefault()
    setUsernameError(null)
    const trimmed = usernameInput.trim()
    if (!trimmed) {
      setUsernameError('Enter a username.')
      return
    }

    const { data, error: insertError } = await supabase
      .from('profiles')
      .insert({ id: session.user.id, username: trimmed })
      .select()
      .single()

    if (insertError) {
      setUsernameError(insertError.code === '23505' ? 'That username is taken. Try another.' : insertError.message)
      return
    }
    setProfile(data)
  }

  const handleRename = async (newUsername) => {
    const trimmed = newUsername.trim()
    if (!trimmed || trimmed === profile.username) return

    const { data, error: updateError } = await supabase
      .from('profiles')
      .update({ username: trimmed })
      .eq('id', session.user.id)
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

    const [eventsRes, rsvpsRes, profilesRes] = await Promise.all([
      supabase.from('events').select('*').order('event_date', { ascending: true }),
      supabase.from('rsvps').select('*'),
      supabase.from('profiles').select('*'),
    ])

    if (eventsRes.error) setError(eventsRes.error.message)
    else setEvents(eventsRes.data)

    if (rsvpsRes.error) setError(rsvpsRes.error.message)
    else setRsvps(rsvpsRes.data)

    if (profilesRes.error) setError(profilesRes.error.message)
    else setProfiles(profilesRes.data)

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
      user_id: session.user.id,
    })

    if (insertError) {
      setError(insertError.message)
      return
    }

    setError(null)
    closeCreateModal()
    fetchAll()
  }

  const myRsvpFor = (eventId) => rsvps.find((r) => r.event_id === eventId && r.user_id === session?.user?.id)

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
        .insert({ event_id: selectedEvent.id, user_id: session.user.id, status })
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
    const isOwner = session && selectedEvent.user_id === session.user.id
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

  const calendarEvents = events.map((ev) => {
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
        <form onSubmit={handleCreateProfile} className="bg-white rounded-xl shadow-sm border border-stone-200 p-8 w-full max-w-sm">
          <h1 className="text-xl font-bold text-stone-800 mb-1">Pick a username</h1>
          <p className="text-sm text-stone-500 mb-6">This is how your friends will see you. You can change it anytime.</p>
          <input
            type="text"
            required
            autoFocus
            maxLength={24}
            value={usernameInput}
            onChange={(e) => setUsernameInput(e.target.value)}
            placeholder="e.g. Sam"
            className="w-full border border-stone-300 rounded-md px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-emerald-700"
          />
          {usernameError && <p className="text-sm text-red-600 mb-3">{usernameError}</p>}
          <button type="submit" className="w-full bg-emerald-800 text-white text-sm font-medium py-2 rounded-md hover:bg-emerald-900 transition">
            Continue
          </button>
        </form>
      </div>
    )
  }

  const myStatus = selectedEvent ? statusFor(selectedEvent.id) : 'undecided'
  const { attending, declined } = selectedEvent ? attendeesFor(selectedEvent.id) : { attending: [], declined: [] }
  const isEventOwner = selectedEvent && session && selectedEvent.user_id === session.user.id
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

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="w-3 h-3 rounded-full bg-emerald-900 inline-block" />
            Attending
            <span className="w-3 h-3 rounded-full bg-red-800 inline-block ml-3" />
            Declined
            <span className="w-3 h-3 rounded-full bg-stone-400 inline-block ml-3" />
            Undecided
          </div>

          <button
            onClick={() => setUsersModalOpen(true)}
            className="text-sm px-3 py-1.5 rounded-md bg-stone-200 hover:bg-stone-300 transition"
          >
            Users ({profiles.length})
          </button>

          {profile && <UsernameEditor username={profile.username} onSave={handleRename} />}
        </div>
      </header>

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
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-stone-800 mb-4">Users ({profiles.length})</h2>
            <ul className="space-y-2 max-h-80 overflow-y-auto">
              {profiles.map((p) => (
                <li key={p.id} className="flex items-center justify-between text-sm text-stone-700 border-b border-stone-100 pb-2">
                  <span>{p.username}</span>
                  {p.is_admin && <span className="text-xs bg-amber-800 text-white px-2 py-0.5 rounded-full">Admin</span>}
                </li>
              ))}
            </ul>
            <div className="flex justify-end pt-4">
              <button onClick={() => setUsersModalOpen(false)} className="px-4 py-2 text-sm rounded-md bg-stone-100 hover:bg-stone-200 transition">
                Close
              </button>
            </div>
          </div>
        </div>
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
