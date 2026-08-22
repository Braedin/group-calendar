import { useState } from 'react'
import { supabase } from './lib/supabase'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function getFifoStatusForDate(roster, dateStr) {
  const cycleStart = new Date(roster.cycle_start + 'T00:00:00')
  const target = new Date(dateStr + 'T00:00:00')
  if (target < cycleStart) return null
  if (target.getDay() !== cycleStart.getDay()) return null

  const cycleWeeks = roster.weeks_away + roster.weeks_home
  const daysDiff = Math.round((target - cycleStart) / (1000 * 60 * 60 * 24))
  const weeksSinceStart = Math.floor(daysDiff / 7)
  const posInCycle = ((weeksSinceStart % cycleWeeks) + cycleWeeks) % cycleWeeks

  if (posInCycle === 0) return 'fly-out'
  if (posInCycle === roster.weeks_away) return 'fly-in'
  return null
}

export function getFifoAwayHomeStatus(roster, dateStr) {
  const cycleStart = new Date(roster.cycle_start + 'T00:00:00')
  const target = new Date(dateStr + 'T00:00:00')
  if (target < cycleStart) return null

  const cycleWeeks = roster.weeks_away + roster.weeks_home
  const daysDiff = Math.floor((target - cycleStart) / (1000 * 60 * 60 * 24))
  const totalDays = cycleWeeks * 7
  const dayPos = ((daysDiff % totalDays) + totalDays) % totalDays
  const awayDays = roster.weeks_away * 7

  return dayPos < awayDays ? 'away' : 'home'
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

export function isDateBlocked(overrides, userId, dateStr) {
  const target = new Date(dateStr + 'T00:00:00')
  return overrides.some((o) => {
    if (o.user_id !== userId) return false
    const start = new Date(o.start_date + 'T00:00:00')
    const end = new Date(o.end_date + 'T00:00:00')
    return target >= start && target <= end
  })
}

export default function MySchedule({ profile, onClose, onSaved }) {
  const [tab, setTab] = useState('recurring')

  const [rWeekday, setRWeekday] = useState('4')
  const [rStartDate, setRStartDate] = useState(new Date().toISOString().split('T')[0])
  const [rEndDate, setREndDate] = useState('')
  const [rLabel, setRLabel] = useState('Work')
  const [rError, setRError] = useState(null)

  const [fCycleStart, setFCycleStart] = useState(new Date().toISOString().split('T')[0])
  const [fWeeksAway, setFWeeksAway] = useState('2')
  const [fWeeksHome, setFWeeksHome] = useState('1')
  const [fError, setFError] = useState(null)

  const [bStartDate, setBStartDate] = useState(new Date().toISOString().split('T')[0])
  const [bEndDate, setBEndDate] = useState(new Date().toISOString().split('T')[0])
  const [bReason, setBReason] = useState('Holiday')
  const [bError, setBError] = useState(null)

  const [myRecurring, setMyRecurring] = useState([])
  const [myRosters, setMyRosters] = useState([])
  const [myOverrides, setMyOverrides] = useState([])

  const loadMine = async () => {
    const [recRes, rosterRes, overrideRes] = await Promise.all([
      supabase.from('recurring_unavailability').select('*').eq('user_id', profile.id),
      supabase.from('fifo_rosters').select('*').eq('user_id', profile.id),
      supabase.from('schedule_overrides').select('*').eq('user_id', profile.id),
    ])
    if (recRes.data) setMyRecurring(recRes.data)
    if (rosterRes.data) setMyRosters(rosterRes.data)
    if (overrideRes.data) setMyOverrides(overrideRes.data)
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
    const weeksAway = parseInt(fWeeksAway, 10)
    const weeksHome = parseInt(fWeeksHome, 10)
    if (!weeksAway || !weeksHome) {
      setFError('Enter valid week counts (whole weeks only, so your fly day never drifts).')
      return
    }

    await supabase.from('fifo_rosters').update({ active: false }).eq('user_id', profile.id)

    const { error } = await supabase.from('fifo_rosters').insert({
      user_id: profile.id,
      cycle_start: fCycleStart,
      weeks_away: weeksAway,
      weeks_home: weeksHome,
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

  const handleClearAllRosters = async () => {
    const confirmClear = window.confirm('Remove all of your FIFO rosters (active and inactive)? This cannot be undone.')
    if (!confirmClear) return
    await supabase.from('fifo_rosters').delete().eq('user_id', profile.id)
    loadMine()
    onSaved()
  }

  const handleAddOverride = async (e) => {
    e.preventDefault()
    setBError(null)
    if (!bStartDate || !bEndDate) {
      setBError('Pick a start and end date.')
      return
    }
    if (new Date(bEndDate) < new Date(bStartDate)) {
      setBError('End date must be on or after the start date.')
      return
    }

    const { error } = await supabase.from('schedule_overrides').insert({
      user_id: profile.id,
      start_date: bStartDate,
      end_date: bEndDate,
      reason: bReason.trim() || 'Blocked',
    })
    if (error) setBError(error.message)
    else {
      loadMine()
      onSaved()
    }
  }

  const handleDeleteOverride = async (id) => {
    await supabase.from('schedule_overrides').delete().eq('id', id)
    loadMine()
    onSaved()
  }

  const fifoWeekday = (roster) => WEEKDAYS[new Date(roster.cycle_start + 'T00:00:00').getDay()]

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-stone-800 mb-4">My schedule</h2>

        <div className="flex gap-2 mb-6 border-b border-stone-200 flex-wrap">
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
          <button
            onClick={() => setTab('block')}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition ${tab === 'block' ? 'border-emerald-800 text-emerald-800' : 'border-transparent text-stone-500'}`}
          >
            Block dates
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
              Set your FIFO cycle in whole weeks so your fly-out and fly-in always land on the same day of the week. Adding a new roster replaces your current active one.
            </p>

            {myRosters.length > 0 && (
              <ul className="mb-4 space-y-2">
                {myRosters.map((r) => (
                  <li key={r.id} className="flex items-center justify-between text-sm bg-stone-50 border border-stone-200 rounded-md px-3 py-2">
                    <span>
                      {r.weeks_away}wk away / {r.weeks_home}wk home, flies {fifoWeekday(r)}s, starting {r.cycle_start}
                      {!r.active && <span className="ml-2 text-xs text-stone-400">(inactive)</span>}
                    </span>
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
                <p className="text-xs text-stone-400 mt-1">
                  Your fly-out and fly-in days will always fall on {WEEKDAYS[new Date(fCycleStart + 'T00:00:00').getDay()]}s.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1">Weeks away</label>
                  <input
                    type="number"
                    min="1"
                    value={fWeeksAway}
                    onChange={(e) => setFWeeksAway(e.target.value)}
                    className="w-full border border-stone-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1">Weeks home</label>
                  <input
                    type="number"
                    min="1"
                    value={fWeeksHome}
                    onChange={(e) => setFWeeksHome(e.target.value)}
                    className="w-full border border-stone-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  />
                </div>
              </div>
              {fError && <p className="text-sm text-red-600">{fError}</p>}
              <button type="submit" className="w-full bg-emerald-800 text-white text-sm font-medium py-2 rounded-md hover:bg-emerald-900 transition">
                Save FIFO roster
              </button>
            </form>

            {myRosters.length > 0 && (
              <button
                onClick={handleClearAllRosters}
                className="w-full mt-3 text-sm text-red-600 hover:text-red-800 border border-red-200 rounded-md py-2 transition"
              >
                Clear all FIFO rosters
              </button>
            )}
          </div>
        )}

        {tab === 'block' && (
          <div>
            <p className="text-sm text-stone-500 mb-4">
              Block out a date range - like a holiday - to hide your FIFO and recurring status on the calendar for those days.
            </p>

            {myOverrides.length > 0 && (
              <ul className="mb-4 space-y-2">
                {myOverrides.map((o) => (
                  <li key={o.id} className="flex items-center justify-between text-sm bg-stone-50 border border-stone-200 rounded-md px-3 py-2">
                    <span>{o.reason}: {o.start_date} to {o.end_date}</span>
                    <button onClick={() => handleDeleteOverride(o.id)} className="text-red-600 hover:text-red-800 text-xs">Remove</button>
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={handleAddOverride} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">Reason</label>
                <input
                  type="text"
                  value={bReason}
                  onChange={(e) => setBReason(e.target.value)}
                  className="w-full border border-stone-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  placeholder="Holiday"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1">From</label>
                  <input
                    type="date"
                    value={bStartDate}
                    onChange={(e) => setBStartDate(e.target.value)}
                    className="w-full border border-stone-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1">To</label>
                  <input
                    type="date"
                    value={bEndDate}
                    onChange={(e) => setBEndDate(e.target.value)}
                    className="w-full border border-stone-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  />
                </div>
              </div>
              {bError && <p className="text-sm text-red-600">{bError}</p>}
              <button type="submit" className="w-full bg-emerald-800 text-white text-sm font-medium py-2 rounded-md hover:bg-emerald-900 transition">
                Block these dates
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
