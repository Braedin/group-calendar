import { useEffect, useState, useCallback } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import { supabase } from './lib/supabase'

const CATEGORY_COLORS = {
  event: { bg: '#7c3aed', border: '#6d28d9' },
  availability: { bg: '#16a34a', border: '#15803d' },
}

export default function App() {
  const [session, setSession] = useState(null)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [modalRange, setModalRange] = useState(null)
  const [form, setForm] = useState({ title: '', userName: '', category: 'event' })
  const [authEmail, setAuthEmail] = useState('')
  const [authSent, setAuthSent] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    const { data, error: fetchError } = await supabase
      .from('events')
      .select('*')
      .order('start_time', { ascending: true })

    if (fetchError) {
      setError(fetchError.message)
    } else {
      setEvents(data)
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  useEffect(() => {
    const channel = supabase
      .channel('events-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events' },
        () => fetchEvents()
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [fetchEvents])

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
    setForm({ title: '', userName: '', category: 'event' })
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setModalRange(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!session) {
      setError('Please sign in before posting an event.')
      return
    }
    if (!form.title.trim() || !form.userName.trim()) {
      setError('Title and your name are required.')
      return
    }

    const { error: insertError } = await supabase.from('events').insert({
      title: form.title.trim(),
      user_name: form.userName.trim(),
      category: form.category,
      start_time: modalRange.start.toISOString(),
      end_time: modalRange.end.toISOString(),
      user_id: session.user.id,
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

  const handleSignIn = async (e) => {
    e.preventDefault()
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: authEmail,
      options: { emailRedirectTo: window.location.origin },
    })
    if (authError) setError(authError.message)
    else setAuthSent(true)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
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

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <header className="max-w-6xl mx-auto mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Group Calendar</h1>
          <p className="text-sm text-slate-500">
            Click a day, or drag across days/times, to add an event or availability.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="w-3 h-3 rounded-full bg-purple-600 inline-block" />
            Group Event
            <span className="w-3 h-3 rounded-full bg-green-600 inline-block ml-3" />
            Availability
          </div>

          {session ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">{session.user.email}</span>
              <button
                onClick={handleSignOut}
                className="text-sm px-3 py-1.5 rounded-md bg-slate-200 hover:bg-slate-300 transition"
              >
                Sign out
              </button>
            </div>
          ) : (
            <form onSubmit={handleSignIn} className="flex items-center gap-2">
              <input
                type="email"
                required
                placeholder="you@example.com"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                className="text-sm border border-slate-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <button
                type="submit"
                className="text-sm px-3 py-1.5 rounded-md bg-purple-600 text-white hover:bg-purple-700 transition"
              >
                {authSent ? 'Link sent ✓' : 'Sign in'}
              </button>
            </form>
          )}
        </div>
      </header>

      {error && (
        <div className="max-w-6xl mx-auto mb-4 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">
          {error}
        </div>
      )}

      <main className="max-w-6xl mx-auto bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        {loading ? (
          <p className="text-slate-500 text-sm p-4">Loading calendar…</p>
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
            <h2 className="text-lg font-semibold text-slate-800 mb-4">
              New entry —{' '}
              {modalRange.start.toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="e.g. Board game night"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Your name
                </label>
                <input
                  type="text"
                  required
                  value={form.userName}
                  onChange={(e) => setForm({ ...form, userName: e.target.value })}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="e.g. Sam"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Type
                </label>
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

              {!session && (
                <p className="text-xs text-amber-600">
                  Sign in with the email field above before submitting.
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-sm rounded-md bg-slate-100 hover:bg-slate-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm rounded-md bg-purple-600 text-white hover:bg-purple-700 transition"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
