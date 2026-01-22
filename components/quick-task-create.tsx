"use client"

import { Button } from "@/components/ui/button"
import type { TaskList } from "../types/task"
import { Plus } from "lucide-react"

interface QuickTaskCreateProps {
  availableLists: TaskList[]
  onCreateTask: (title: string, listIds?: string[]) => Promise<string | null>
  onShowDetailedForm?: () => void
}

export function QuickTaskCreate({ availableLists, onCreateTask, onShowDetailedForm }: QuickTaskCreateProps) {

  return (
    <div className="text-center max-w-md">
      <h2 className="text-3xl font-bold text-white mb-3">Ready to become super productive?</h2>
    </div>
  )
}
