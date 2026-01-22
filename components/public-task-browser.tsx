"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Checkbox } from "@/components/ui/checkbox"
import type { Task, TaskList, User } from "../types/task"
import { Search, Copy, Globe, Calendar } from "lucide-react"
import { format } from "date-fns"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface PublicTaskBrowserProps {
  publicLists: TaskList[]
  publicTasks: Task[]
  currentUser: User
  onCopyTask: (task: Task, targetLists: TaskList[]) => void
  onClose: () => void
}

export function PublicTaskBrowser({
  publicLists,
  publicTasks,
  currentUser,
  onCopyTask,
  onClose,
}: PublicTaskBrowserProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedListId, setSelectedListId] = useState<string>("")
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set())

  // Get priority colors for avatars
  const getPriorityColor = (priority: number) => {
    switch (priority) {
      case 3: return 'rgb(239, 68, 68)' // Red - highest priority
      case 2: return 'rgb(251, 191, 36)' // Yellow - medium priority  
      case 1: return 'rgb(59, 130, 246)' // Blue - low priority
      default: return 'rgb(107, 114, 128)' // Gray - no priority
    }
  }

  const filteredTasks = publicTasks.filter((task) => {
    const matchesSearch =
      task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.description.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesList =
      selectedListId === "all" || !selectedListId || task.lists.some((list) => list.id === selectedListId)
    return matchesSearch && matchesList
  })

  const handleToggleTask = (taskId: string) => {
    const newSelected = new Set(selectedTasks)
    if (newSelected.has(taskId)) {
      newSelected.delete(taskId)
    } else {
      newSelected.add(taskId)
    }
    setSelectedTasks(newSelected)
  }

  const handleCopySelected = () => {
    selectedTasks.forEach((taskId) => {
      const task = publicTasks.find((t) => t.id === taskId)
      if (task) {
        // Copy to user's default lists or let them choose
        onCopyTask(task, [])
      }
    })
    setSelectedTasks(new Set())
  }

  const priorityColors = {
    0: "bg-gray-500",
    1: "bg-blue-500",
    2: "bg-yellow-500",
    3: "bg-red-500",
  }

  return (
    <div className="w-96 bg-gray-800 border-l border-gray-700 flex flex-col h-full">
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white flex items-center">
            <Globe className="w-5 h-5 mr-2" />
            Public Tasks
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-gray-400">
            ×
          </Button>
        </div>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search public tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-gray-700 border-gray-600 pl-10 text-white placeholder-gray-400"
            />
          </div>

          <Select value={selectedListId} onValueChange={setSelectedListId}>
            <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
              <SelectValue placeholder="All public lists" />
            </SelectTrigger>
            <SelectContent className="bg-gray-700 border-gray-600">
              <SelectItem value="all" className="text-white">
                All public lists
              </SelectItem>
              {publicLists.map((list) => (
                <SelectItem key={list.id} value={list.id} className="text-white">
                  {list.name} ({publicTasks.filter((t) => t.lists.some((l) => l.id === list.id)).length} tasks)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedTasks.size > 0 && (
            <Button onClick={handleCopySelected} className="w-full bg-blue-600 hover:bg-blue-700">
              <Copy className="w-4 h-4 mr-2" />
              Copy {selectedTasks.size} Task{selectedTasks.size > 1 ? "s" : ""}
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-3">
          {filteredTasks.map((task) => (
            <div
              key={task.id}
              className="p-3 bg-gray-700 rounded-lg border border-gray-600 hover:border-gray-500 transition-colors"
            >
              <div className="flex items-start space-x-3">
                <Checkbox
                  checked={selectedTasks.has(task.id)}
                  onCheckedChange={() => handleToggleTask(task.id)}
                  className="border-gray-500 mt-1"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-white font-medium truncate">{task.title}</h3>
                    <div className="flex items-center space-x-1">
                      {task.priority > 0 && (
                        <div className={`w-2 h-2 rounded-full ${priorityColors[task.priority]}`}></div>
                      )}
                      {task.dueDateTime && (
                        <span className="text-xs text-gray-400 flex items-center">
                          <Calendar className="w-3 h-3 mr-1" />
                          {format(task.dueDateTime, "MMM d")}
                        </span>
                      )}
                    </div>
                  </div>

                  {task.description && <p className="text-sm text-gray-300 mb-2 line-clamp-2">{task.description}</p>}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Avatar 
                        className="w-6 h-6 border-[3px]" 
                        style={{ borderColor: getPriorityColor(task.priority) }}
                      >
                        <AvatarImage src={task.assignee?.image || "/placeholder.svg"} />
                        <AvatarFallback className="text-xs">{task.assignee?.name?.charAt(0) || task.assignee?.email?.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <span className="text-xs text-gray-400">{task.assignee?.name}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {task.lists.slice(0, 2).map((list) => (
                        <Badge key={list.id} variant="outline" className="text-xs border-gray-500 text-gray-300">
                          {list.name}
                        </Badge>
                      ))}
                      {task.lists.length > 2 && (
                        <Badge variant="outline" className="text-xs border-gray-500 text-gray-300">
                          +{task.lists.length - 2}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 pt-2 border-t border-gray-600">
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span>From: {task.lists[0]?.name}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onCopyTask(task, [])}
                        className="h-6 px-2 text-xs text-blue-400 hover:text-blue-300"
                      >
                        <Copy className="w-3 h-3 mr-1" />
                        Copy
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {filteredTasks.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              <Globe className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No public tasks found</p>
              <p className="text-sm">Try adjusting your search or filter</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
