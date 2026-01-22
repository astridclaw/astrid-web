"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { TimePicker, formatConciseTime } from "@/components/ui/time-picker"
import { CalendarIcon, X } from "lucide-react"
import { format } from "date-fns"

interface WhenDateTimePickerProps {
  when?: Date
  onWhenChange: (date: Date | undefined) => void
  compact?: boolean
  defaultDueTime?: string | null // HH:MM format for default time, or null for "all day"
  currentUser?: { defaultDueTime?: string }
}

// Helper function to apply default time to a date
const applyDefaultTime = (date: Date, defaultTime: string | null | undefined): Date => {
  if (!defaultTime) return date
  
  const [hours, minutes] = defaultTime.split(':').map(Number)
  if (isNaN(hours) || isNaN(minutes)) return date
  
  const newDate = new Date(date)
  newDate.setHours(hours, minutes, 0, 0)
  return newDate
}

export function WhenDateTimePicker({
  when,
  onWhenChange,
  compact = false,
  defaultDueTime,
  currentUser,
}: WhenDateTimePickerProps) {
  const [showDatePicker, setShowDatePicker] = useState(false)

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      // Create new date with the selected date and existing time (if any)
      const newDateTime = new Date(date)
      if (when) {
        newDateTime.setHours(when.getHours())
        newDateTime.setMinutes(when.getMinutes())
      } else {
        // Apply default time for new dates
        // Priority: list defaultDueTime → user defaultDueTime → 17:00 fallback
        // BUT: respect explicit "no default time" (null) from list settings
        let defaultTime: string | null | undefined

        if (defaultDueTime !== undefined) {
          // List has explicit defaultDueTime setting (could be null for "no default time")
          defaultTime = defaultDueTime
        } else if (currentUser?.defaultDueTime !== undefined) {
          // Use user's default if no list default
          defaultTime = currentUser.defaultDueTime
        } else {
          // Final fallback
          defaultTime = "17:00"
        }

        const dateWithTime = applyDefaultTime(newDateTime, defaultTime)
        onWhenChange(dateWithTime)
        setShowDatePicker(false)
        return
      }
      onWhenChange(newDateTime)
    }
    setShowDatePicker(false)
  }

  const handleTimeChange = (time: Date | string | null) => {
    if (time && when && time instanceof Date) {
      const newDateTime = new Date(when)
      newDateTime.setHours(time.getHours())
      newDateTime.setMinutes(time.getMinutes())
      onWhenChange(newDateTime)
    }
  }

  const clearWhen = () => {
    onWhenChange(undefined)
  }

  const setToday = () => {
    const today = new Date()
    // Priority: list defaultDueTime → user defaultDueTime → 17:00 fallback
    // BUT: respect explicit "no default time" (null) from list settings
    let defaultTime: string | null | undefined

    if (defaultDueTime !== undefined) {
      defaultTime = defaultDueTime
    } else if (currentUser?.defaultDueTime !== undefined) {
      defaultTime = currentUser.defaultDueTime
    } else {
      defaultTime = "17:00"
    }

    const todayWithTime = applyDefaultTime(today, defaultTime)
    onWhenChange(todayWithTime)
  }

  const setTomorrow = () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    // Priority: list defaultDueTime → user defaultDueTime → 17:00 fallback
    // BUT: respect explicit "no default time" (null) from list settings
    let defaultTime: string | null | undefined

    if (defaultDueTime !== undefined) {
      defaultTime = defaultDueTime
    } else if (currentUser?.defaultDueTime !== undefined) {
      defaultTime = currentUser.defaultDueTime
    } else {
      defaultTime = "17:00"
    }

    const tomorrowWithTime = applyDefaultTime(tomorrow, defaultTime)
    onWhenChange(tomorrowWithTime)
  }

  return (
    <div className="space-y-3">
      <Label className={compact ? "text-gray-800" : "text-gray-300"}>
        When
      </Label>
      
      {/* Quick action buttons */}
      <div className="flex space-x-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={setToday}
          className={compact ? "text-gray-800 border-gray-300" : "bg-gray-700 border-gray-600 text-white hover:bg-gray-600"}
        >
          Today
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={setTomorrow}
          className={compact ? "text-gray-800 border-gray-300" : "bg-gray-700 border-gray-600 text-white hover:bg-gray-600"}
        >
          Tomorrow
        </Button>
        {when && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearWhen}
            className={compact ? "text-gray-600 hover:text-gray-800" : "text-gray-400 hover:text-white"}
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Date picker */}
      <div className="flex space-x-2">
        <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className={`flex-1 justify-start text-left font-normal ${
                compact 
                  ? "bg-white border-gray-300 text-gray-800" 
                  : "bg-gray-700 border-gray-600 text-white hover:bg-gray-600"
              }`}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {when ? format(when, "MMM dd, yyyy") : "Select date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={when}
              onSelect={handleDateSelect}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        {/* Time picker */}
        {when && (
          <div className="flex-shrink-0">
            <TimePicker
              value={when}
              onChange={handleTimeChange}
              compact={compact}
              showAllDayOption={false}
              placeholder="Set time"
            />
          </div>
        )}
      </div>

      {when && (
        <p className={`text-sm ${compact ? "text-gray-600" : "text-gray-400"}`}>
          Scheduled for {format(when, "EEEE, MMMM dd, yyyy")}
          {formatConciseTime(when) && ` at ${formatConciseTime(when)}`}
        </p>
      )}
    </div>
  )
}