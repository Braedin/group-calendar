import { useEffect, useState, useCallback } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import { supabase } from './lib/supabase'

const CATEGORY_COLORS = {
  event: { bg: '#2d4a3a', border: '#1f3428' },
  availability: { bg: '#8b6f47', border: '#6f5738' },
}

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [usernameInput, setUsernameInput] = useState('')
  const [usernameError, setUsernameError] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [modalRange, setModalRange] = useState(null)
  const [form, setForm] = useState({ title: '', category: 'event' })

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession()
      if (data.session) {
        setSession(data.session)
      } else {
        const { data: signInData, error: signInError } = await supabase.auth.signInAnonymously()
        if (signInError) {
          setError(signInError.message)
        } else {
          setSession(signInData.session)
        }
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
      if (insertError.code === '23505') {
        setUsernameError('That username is taken. Try another.')
      } else {
        setUsernameError(insertError.message)
      }
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
      setError(
        updateError.code === '23505'
          ? 'That username is taken.'
          : updateError.message
      )
    } else {
      setProfile(data)
      fetchEvents()
    }
  }

  const fetchEvents = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    const { data, error: fetchError } = await supabase
      .from('events')
      .select('*')
      .order('start_time', { ascending: true })

    if (fetchError) setError(fetchError.message)
    else {
      setEvents(data)
      setError(null)
    }
    setLoading(false)
  }, [profile])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  useEffect(() => {
    if (!profile) return
    const channel = supabase
      .channel('events-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events' },
        () => fetchEvents()
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [profile, fetchEvents])

  const handleDateClick = (info) => {
    const start = info.date
    const end = new Date(start.getTime() + 60 * 60 * 1000)
    openModal(start, end)
  }

  const handleSelect = (info) => {
    openModal(info.start, info.end)
  }

  const openModal = (start, end) => {
    setModalRange({ start, end })
    setForm({ title: '', category: 'event' })
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setModalRange(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) {
      setError('Title is required.')
      return
    }

    const { error: insertError } = await supabase.from('events').insert({
      title: form.title.trim(),
      category: form.category,
      start_time: modalRange.start.toISOString(),
      end_time: modalRange.end.toISOString(),
      user_id: session.user.id,
      user_name: profile.username,
    })

    if (insertError) {
      setError(insertError.message)
      return
    }

    setError(null)
    closeModal()
    fetchEvents()
  }

  const handleEventClick = async (info) => {
    const ev = info.event
    const isOwner = session && ev.extendedProps.user_id === session.user.id
    if (!isOwner) return

    const confirmDelete = window.confirm(`Delete "${ev.title}"?`)
    if (!confirmDelete) return

    const { error: deleteError } = await supabase
      .from('events')
      .delete()
      .eq('id', ev.id)

    if (deleteError) setError(deleteError.message)
    else fetchEvents()
  }

  const calendarEvents = events.map((ev) => ({
    id: ev.id,
    title: `${ev.title} (${ev.user_name})`,
    start: ev.start_time,
    end: ev.end_time,
    backgroundColor: CATEGORY_COLORS[ev.category]?.bg,
    borderColor: CATEGORY_COLORS[ev.category]?.border,
    extendedProps: { user_id: ev.user_id, category: ev.category },
  }))

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
        <form
          onSubmit={handleCreateProfile}
          className="bg-white rounded-xl shadow-sm border border-stone-200 p-8 w-full max-w-sm"
        >
          <h1 className="text-xl font-bold text-stone-800 mb-1">Pick a username</h1>
          <p className="text-sm text-stone-500 mb-6">
            This is how your friends will see you. You can change it anytime.
          </p>
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
          <button
            type="submit"
            className="w-full bg-emerald-800 text-white text-sm font-medium py-2 rounded-md hover:bg-emerald-900 transition"
          >
            Continue
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-100 p-4 md:p-8">
      <header className="max-w-6xl mx-auto mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-800">Group Calendar</h1>
          <p className="text-sm text-stone-500">
            Click a day, or drag across days/times, to add an event or availability.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="w-3 h-3 rounded-full bg-emerald-900 inline-block" />
            Group Event
            <span className="w-3 h-3 rounded-full bg-amber-800 inline-block ml-3" />
            Availability
          </div>

          {profile && (
            <UsernameEditor username={profile.username} onSave={handleRename} />
          )}
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
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek',
            }}
            selectable={true}
            selectMirror={true}
            editable={false}
            dayMaxEvents={true}
            height="auto"
            events={calendarEvents}
            dateClick={handleDateClick}
            select={handleSelect}
            eventClick={handleEventClick}
          />
        )}
      </main>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-stone-800 mb-4">
              New entry - {modalRange.start.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full border border-stone-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  placeholder="e.g. Board game night"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Type</label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="category"
                      value="event"
                      checked={form.category === 'event'}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                    />
                    Group Event
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="category"
                      value="availability"
                      checked={form.category === 'availability'}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                    />
                    My Availability
                  </label>
                </div>
              </div>

              <p className="text-xs text-stone-500">Posting as <span className="font-medium">{profile.username}</span></p>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-sm rounded-md bg-stone-100 hover:bg-stone-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm rounded-md bg-emerald-800 text-white hover:bg-emerald-900 transition"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <BrainrotWidget />
    </div>
  )
}

function UsernameEditor({ username, onSave }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(username)

  if (!editing) {
    return (
      <button
        onClick={() => {
          setValue(username)
          setEditing(true)
        }}
        className="text-sm text-stone-600 hover:text-stone-900 transition underline decoration-dotted"
      >
        {username}
      </button>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSave(value)
        setEditing(false)
      }}
      className="flex items-center gap-2"
    >
      <input
        type="text"
        autoFocus
        maxLength={24}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="text-sm border border-stone-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-700"
      />
      <button type="submit" className="text-sm px-2 py-1 rounded-md bg-emerald-800 text-white hover:bg-emerald-900 transition">
        Save
      </button>
      <button type="button" onClick={() => setEditing(false)} className="text-sm px-2 py-1 rounded-md bg-stone-100 hover:bg-stone-200 transition">
        Cancel
      </button>
    </form>
  )
}

function BrainrotWidget() {
  const [videoKey, setVideoKey] = useState('subway')
  const [minimized, setMinimized] = useState(false)

  const VIDEOS = {
    subway: 'eRXE8Aebp7s',
    familyguy: 'pLSy_xMBKHY',
    rickmorty: 'VBZ-_ICc4dQ',
  }

  const LABELS = {
    subway: 'Subway Surfers',
    familyguy: 'Family Guy',
    rickmorty: 'Rick and Morty',
  }

  const embedSrc = `https://www.youtube.com/embed/${VIDEOS[videoKey]}?autoplay=1&mute=1&loop=1&playlist=${VIDEOS[videoKey]}&controls=1`

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
      {!minimized && (
        <div className="bg-black rounded-lg shadow-xl overflow-hidden border border-stone-300" style={{ width: 320, height: 180 }}>
          <iframe
            key={videoKey}
            width="320"
            height="180"
            src={embedSrc}
            title="Background video"
            frameBorder="0"
            allow="autoplay; encrypted-media"
            allowFullScreen
          />
        </div>
      )}

      <div className="bg-white rounded-md shadow-md border border-stone-200 px-2 py-1.5 flex items-center gap-2">
        <select
          value={videoKey}
          onChange={(e) => setVideoKey(e.target.value)}
          className="text-xs border border-stone-300 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-700"
        >
          {Object.keys(VIDEOS).map((key) => (
            <option key={key} value={key}>{LABELS[key]}</option>
          ))}
        </select>
        <button
          onClick={() => setMinimized((m) => !m)}
          className="text-xs px-2 py-1 rounded bg-stone-100 hover:bg-stone-200 transition"
        >
          {minimized ? 'Show' : 'Hide'}
        </button>
      </div>
    </div>
  )
}
