import { useState } from 'react'
import { supabase } from './lib/supabase'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function blockAppliesToDate(block, dateStr) {
  const target = new Date(dateStr + 'T00:00:00')
  const start = new Date(block.start_date + 'T00:00:00')

  if (block.pattern === 'single') {
    return dateStr === block.start_date
  }

  if (block.pattern === 'range') {
    const end = new Date(block.end_date + 'T00:00:00')
    return target >= start && target <= end
  }

  if (block.pattern === 'recurring') {
    if (target < start) return false
    if (block.end_date) {
      const end = new Date(block.end_date + 'T00:00:00')
      if (target > end) return false
    }
    return target.getDay() === block.weekday
  }

  return false
}

export function getBlocksForDate(blocks, userId, dateStr) {
  return blocks.filter((b) => b.user_id === userId && blockAppliesToDate(b, dateStr))
}

function formatTimeRange(block) {
  if (block.all_day) return 'All day'
  const fmt = (t) => {
    if (!t) return ''
    const [h, m] = t.split(':')
    const hour = parseInt(h, 10)
    const suffix = hour >= 12 ? 'PM' : 'AM'
    const hour12 = hour % 12 === 0 ? 12 : hour % 12
    return `${hour12}:${m} ${suffix}`
  }
  return `${fmt(block.start_time)} - ${fmt(block.end_time)}`
}
export { formatTimeRange }

export default function MySchedule({ profile, onClose, onSaved }) {
  const [status, setStatus] = useState('unavailable')
  const [label, setLabel] = useState('Work')
  const [pattern, setPattern] = useState('single')
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [endDate, setEndDate] = useState('')
  const [weekday, setWeekday] = useState('4')
  const [allDay, setAllDay] = useState(true)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('17:00')
  const [formError, setFormError] = useState(null)

  const [myBlocks, setMyBlocks] = useState([])

  const loadMine = async () => {
    const { data, error } = await supabase
      .from('schedule_blocks')
      .select('*')
      .eq('user_id', profile.id)
      .order('start_date', { ascending: true })
    if (data) setMyBlocks(data)
    if (error) setFormError(error.message)
  }

  useState(() => { loadMine() })

  const handleClearAll = async () => {
    const confirmClear = window.confirm('Remove all of your schedule blocks? This cannot be undone.')
    if (!confirmClear) return
    await supabase.from('schedule_blocks').delete().eq('user_id', profile.id)
    loadMine()
    onSaved()
  }

  const handleAddBlock = async (e) => {
    e.preventDefault()
    setFormError(null)

    if (pattern === 'range' && (!startDate || !endDate)) {
      setFormError('Pick a start and end date for a date range.')
      return
    }
    if (pattern === 'range' && new Date(endDate) < new Date(startDate)) {
      setFormError('End date must be on or after the start date.')
      return
    }
    if (!allDay && (!startTime || !endTime)) {
      setFormError('Pick a start and end time, or switch back to all day.')
      return
    }

    const payload = {
      user_id: profile.id,
      status,
      label: label.trim() || (status === 'unavailable' ? 'Unavailable' : 'Available'),
      pattern,
      start_date: pattern === 'recurring' ? startDate : (pattern === 'single' ? startDate : startDate),
      end_date: pattern === 'range' ? endDate : (pattern === 'recurring' ? (endDate || null) : null),
      weekday: pattern === 'recurring' ? parseInt(weekday, 10) : null,
      all_day: allDay,
      start_time: allDay ? null : startTime,
      end_time: allDay ? null : endTime,
    }

    const { error } = await supabase.from('schedule_blocks').insert(payload)
    if (error) setFormError(error.message)
    else {
      loadMine()
      onSaved()
    }
  }

  const handleDeleteBlock = async (id) => {
    await supabase.from('schedule_blocks').delete().eq('id', id)
    loadMine()
    onSaved()
  }

  const describeBlock = (b) => {
    let when = ''
    if (b.pattern === 'single') when = b.start_date
    if (b.pattern === 'range') when = `${b.start_date} to ${b.end_date}`
    if (b.pattern === 'recurring') when = `every ${WEEKDAYS[b.weekday]}${b.end_date ? ` until ${b.end_date}` : ''} (from ${b.start_date})`
    return `${when} - ${formatTimeRange(b)}`
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-stone-800 mb-1">My schedule</h2>
        <p className="text-sm text-stone-500 mb-4">
          Mark yourself unavailable or available for a single day, a date range, or on a recurring weekday. Blocks are all-day by default, but you can set specific times.
        </p>

        {myBlocks.length > 0 && (
          <ul className="mb-4 space-y-2">
            {myBlocks.map((b) => (
              <li key={b.id} className="flex items-center justify-between text-sm bg-stone-50 border border-stone-200 rounded-md px-3 py-2">
                <span>
                  <span className={`inline-block w-2 h-2 rounded-full mr-2 ${b.status === 'unavailable' ? 'bg-red-700' : 'bg-emerald-700'}`} />
                  <strong>{b.label}</strong> ({b.status}) - {describeBlock(b)}
                </span>
                <button onClick={() => handleDeleteBlock(b.id)} className="text-red-600 hover:text-red-800 text-xs shrink-0 ml-2">Remove</button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleAddBlock} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full border border-stone-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
              >
                <option value="unavailable">Unavailable</option>
                <option value="available">Available</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Label</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full border border-stone-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                placeholder="Work"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Pattern</label>
            <div className="flex gap-2">
              {[['single', 'Single day'], ['range', 'Date range'], ['recurring', 'Recurring']].map(([val, text]) => (
                <button
                  type="button"
                  key={val}
                  onClick={() => setPattern(val)}
                  className={`flex-1 text-sm px-3 py-2 rounded-md border transition ${pattern === val ? 'bg-emerald-800 text-white border-emerald-800' : 'bg-white text-stone-600 border-stone-300 hover:bg-stone-50'}`}
                >
                  {text}
                </button>
              ))}
            </div>
          </div>

          {pattern === 'single' && (
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border border-stone-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
            </div>
          )}

          {pattern === 'range' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">From</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full border border-stone-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">To</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full border border-stone-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>
            </div>
          )}

          {pattern === 'recurring' && (
            <>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">Day of week</label>
                <select
                  value={weekday}
                  onChange={(e) => setWeekday(e.target.value)}
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
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full border border-stone-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1">Until (optional)</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full border border-stone-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="flex items-center gap-2 text-sm text-stone-700">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                className="rounded border-stone-300"
              />
              All day
            </label>
          </div>

          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">Start time</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full border border-stone-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">End time</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full border border-stone-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>
            </div>
          )}

          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <button type="submit" className="w-full bg-emerald-800 text-white text-sm font-medium py-2 rounded-md hover:bg-emerald-900 transition">
            Add block
          </button>
        </form>

        {myBlocks.length > 0 && (
          <button
            onClick={handleClearAll}
            className="w-full mt-3 text-sm text-red-600 hover:text-red-800 border border-red-200 rounded-md py-2 transition"
          >
            Clear all schedule blocks
          </button>
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
