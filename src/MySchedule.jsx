import { useState } from 'react'
import { supabase } from './lib/supabase'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function getFifoStatusForDate(roster, dateStr) {
  const cycleStart = new Date(roster.cycle_start + 'T00:00:00')
  const target = new Date(dateStr + 'T00:00:00')
  const cycleLength = roster.days_away + roster.days_home
  const dayDiff = Math.floor((target - cycleStart) / (1000 * 60 * 60 * 24))
  if (dayDiff < 0) return null
  const posInCycle = ((dayDiff % cycleLength) + cycleLength) % cycleLength
  if (posInCycle === 0) return 'fly-out'
  if (posInCycle === roster.days_away) return 'fly-in'
  if (posInCycle < roster.days_away) return 'away'
  return 'home'
}

export function matchesRecurringRule(rule, dateStr) {
  const target = new Date(dateStr + 'T00:00:00')
  const start = new Date(rule.start_date + 'T00:00:00')
  if (target < start) return false
  if (rule.end_date) {
    const end = new Date(rule.end_date + 'T00:00:00')
    if (target > end) return false
  }
  return target.getDay() === rule.weekday
}

export default function MySchedule({ profile, onClose, onSaved }) {
  const [tab, setTab] = useState('recurring')

  const [rWeekday, setRWeekday] = useState('4')
  const [rStartDate, setRStartDate] = useState(new Date().toISOString().split('T')[0])
  const [rEndDate, setREndDate] = useState('')
  const [rLabel, setRLabel] = useState('Work')
  const [rError, setRError] = useState(null)

  const [fCycleStart, setFCycleStart] = useState(new Date().toISOString().split('T')[0])
  const [fDaysAway, setFDaysAway] = useState('14')
  const [fDaysHome, setFDaysHome] = useState('7')
  const [fError, setFError] = useState(null)

  const [myRecurring, setMyRecurring] = useState([])
  const [myRosters, setMyRosters] = useState([])

  const loadMine = async () => {
    const [recRes, rosterRes] = await Promise.all([
      supabase.from('recurring_unavailability').select('*').eq('user_id', profile.id),
      supabase.from('fifo_rosters').select('*').eq('user_id', profile.id).eq('active', true),
    ])
    if (recRes.data) setMyRecurring(recRes.data)
    if (rosterRes.data) setMyRosters(rosterRes.data)
  }

  useState(() => { loadMine() })

  const handleAddRecurring = async (e) => {
    e.preventDefault()
    setRError(null)
    const { error } = await supabase.from('recurring_unavailability').insert({
      user_id: profile.id,
      label: rLabel.trim() || 'Unavailable',
      weekday: parseInt(rWeekday, 10),
      start_date: rStartDate,
      end_date: rEndDate || null,
    })
    if (error) setRError(error.message)
    else {
      loadMine()
      onSaved()
    }
  }

  const handleDeleteRecurring = async (id) => {
    await supabase.from('recurring_unavailability').delete().eq('id', id)
    loadMine()
    onSaved()
  }

  const handleAddRoster = async (e) => {
    e.preventDefault()
    setFError(null)
    const away = parseInt(fDaysAway, 10)
    const home = parseInt(fDaysHome, 10)
    if (!away || !home) {
      setFError('Enter valid day counts.')
      return
    }

    await supabase.from('fifo_rosters').update({ active: false }).eq('user_id', profile.id)

    const { error } = await supabase.from('fifo_rosters').insert({
      user_id: profile.id,
      cycle_start: fCycleStart,
      days_away: away,
      days_home: home,
      active: true,
    })
    if (error) setFError(error.message)
    else {
      loadMine()
      onSaved()
    }
  }

  const handleDeleteRoster = async (id) => {
    await supabase.from('fifo_rosters').delete().eq('id', id)
    loadMine()
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-stone-800 mb-4">My schedule</h2>

        <div className="flex gap-2 mb-6 border-b border-stone-200">
          <button
            onClick={() => setTab('recurring')}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition ${tab === 'recurring' ? 'border-emerald-800 text-emerald-800' : 'border-transparent text-stone-500'}`}
          >
            Recurring
          </button>
          <button
            onClick={() => setTab('fifo')}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition ${tab === 'fifo' ? 'border-emerald-800 text-emerald-800' : 'border-transparent text-stone-500'}`}
          >
            FIFO roster
          </button>
        </div>

        {tab === 'recurring' && (
          <div>
            <p className="text-sm text-stone-500 mb-4">
              Mark a day of the week you're regularly unavailable, like a standing work shift.
            </p>

            {myRecurring.length > 0 && (
              <ul className="mb-4 space-y-2">
                {myRecurring.map((r) => (
                  <li key={r.id} className="flex items-center justify-between text-sm bg-stone-50 border border-stone-200 rounded-md px-3 py-2">
                    <span>{r.label} - every {WEEKDAYS[r.weekday]}{r.end_date ? ` until ${r.end_date}` : ''}</span>
                    <button onClick={() => handleDeleteRecurring(r.id)} className="text-red-600 hover:text-red-800 text-xs">Remove</button>
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={handleAddRecurring} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">Label</label>
                <input
                  type="text"
                  value={rLabel}
                  onChange={(e) => setRLabel(e.target.value)}
                  className="w-full border border-stone-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  placeholder="Work"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">Day of week</label>
                <select
                  value={rWeekday}
                  onChange={(e) => setRWeekday(e.target.value)}
                  className="w-full border border-stone-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                >
                  {WEEKDAYS.map((day, i) => (
                    <option key={i} value={i}>{day}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1">Starting from</label>
                  <input
                    type="date"
                    value={rStartDate}
                    onChange={(e) => setRStartDate(e.target.value)}
                    className="w-full border border-stone-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1">Until (optional)</label>
                  <input
                    type="date"
                    value={rEndDate}
                    onChange={(e) => setREndDate(e.target.value)}
                    className="w-full border border-stone-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  />
                </div>
              </div>
              {rError && <p className="text-sm text-red-600">{rError}</p>}
              <button type="submit" className="w-full bg-emerald-800 text-white text-sm font-medium py-2 rounded-md hover:bg-emerald-900 transition">
                Add recurring unavailability
              </button>
            </form>
          </div>
        )}

        {tab === 'fifo' && (
          <div>
            <p className="text-sm text-stone-500 mb-4">
              Set your FIFO cycle once and it repeats automatically. Adding a new one replaces your current active roster.
            </p>

            {myRosters.length > 0 && (
              <ul className="mb-4 space-y-2">
                {myRosters.map((r) => (
                  <li key={r.id} className="flex items-center justify-between text-sm bg-stone-50 border border-stone-200 rounded-md px-3 py-2">
                    <span>{r.days_away} away / {r.days_home} home, starting {r.cycle_start}</span>
                    <button onClick={() => handleDeleteRoster(r.id)} className="text-red-600 hover:text-red-800 text-xs">Remove</button>
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={handleAddRoster} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">Next (or most recent) fly-out date</label>
                <input
                  type="date"
                  value={fCycleStart}
                  onChange={(e) => setFCycleStart(e.target.value)}
                  className="w-full border border-stone-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1">Days away</label>
                  <input
                    type="number"
                    min="1"
                    value={fDaysAway}
                    onChange={(e) => setFDaysAway(e.target.value)}
                    className="w-full border border-stone-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1">Days home</label>
                  <input
                    type="number"
                    min="1"
                    value={fDaysHome}
                    onChange={(e) => setFDaysHome(e.target.value)}
                    className="w-full border border-stone-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  />
                </div>
              </div>
              {fError && <p className="text-sm text-red-600">{fError}</p>}
              <button type="submit" className="w-full bg-emerald-800 text-white text-sm font-medium py-2 rounded-md hover:bg-emerald-900 transition">
                Save FIFO roster
              </button>
            </form>
          </div>
        )}

        <div className="flex justify-end pt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md bg-stone-100 hover:bg-stone-200 transition">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
