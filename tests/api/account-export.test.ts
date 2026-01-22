import { describe, it, expect, beforeEach, vi } from "vitest"
import { NextRequest } from "next/server"
import { GET } from "@/app/api/account/export/route"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"

vi.mock("next-auth")
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn()
    }
  }
}))

describe("Account Export API", () => {
  const mockSession = {
    user: {
      id: "user-123",
      email: "test@example.com",
      name: "Test User"
    }
  }

  const mockUserData = {
    id: "user-123",
    name: "Test User",
    email: "test@example.com",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    defaultDueTime: "17:00",
    aiAssistantSettings: null,
    mcpEnabled: true,
    createdTasks: [
      {
        id: "task-1",
        title: "Test Task",
        description: "Test Description",
        priority: 1,
        completed: false,
        repeating: "never",
        isPrivate: true,
        dueDateTime: new Date("2024-12-31"),
        when: null,
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-01"),
        lists: [{ id: "list-1", name: "Test List" }],
        assignee: { id: "user-2", name: "Assignee", email: "assignee@example.com" },
        comments: [],
        attachments: [],
        secureFiles: []
      }
    ],
    assignedTasks: [],
    ownedLists: [],
    listMemberships: [],
    comments: [],
    reminderSettings: null,
    githubIntegration: null,
    mcpTokens: []
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("JSON Export", () => {
    it("should export user data as JSON", async () => {
      vi.mocked(getServerSession).mockResolvedValue(mockSession as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUserData as any)

      const request = new NextRequest("http://localhost:3000/api/account/export?format=json")
      const response = await GET(request)

      expect(response.status).toBe(200)
      expect(response.headers.get("Content-Type")).toBe("application/json")
      expect(response.headers.get("Content-Disposition")).toContain("astrid-export-")
      expect(response.headers.get("Content-Disposition")).toContain(".json")

      const data = await response.json()
      expect(data.user.email).toBe("test@example.com")
      expect(data.tasks.created).toHaveLength(1)
      expect(data.tasks.created[0].title).toBe("Test Task")
    })

    it("should require authentication", async () => {
      vi.mocked(getServerSession).mockResolvedValue(null)

      const request = new NextRequest("http://localhost:3000/api/account/export?format=json")
      const response = await GET(request)

      expect(response.status).toBe(401)
      expect(await response.text()).toBe("Unauthorized")
    })

    it("should handle user not found", async () => {
      vi.mocked(getServerSession).mockResolvedValue(mockSession as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null)

      const request = new NextRequest("http://localhost:3000/api/account/export?format=json")
      const response = await GET(request)

      expect(response.status).toBe(404)
      expect(await response.text()).toBe("User not found")
    })
  })

  describe("CSV Export", () => {
    it("should export user data as CSV", async () => {
      vi.mocked(getServerSession).mockResolvedValue(mockSession as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUserData as any)

      const request = new NextRequest("http://localhost:3000/api/account/export?format=csv")
      const response = await GET(request)

      expect(response.status).toBe(200)
      expect(response.headers.get("Content-Type")).toBe("text/csv")
      expect(response.headers.get("Content-Disposition")).toContain(".csv")

      const csv = await response.text()
      expect(csv).toContain("taskId,title,description")
      expect(csv).toContain("Test Task")
    })

    it("should escape CSV values with commas", async () => {
      const userWithCommaData = {
        ...mockUserData,
        createdTasks: [
          {
            ...mockUserData.createdTasks[0],
            title: "Task with, comma",
            description: "Description with, multiple, commas"
          }
        ]
      }

      vi.mocked(getServerSession).mockResolvedValue(mockSession as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(userWithCommaData as any)

      const request = new NextRequest("http://localhost:3000/api/account/export?format=csv")
      const response = await GET(request)

      const csv = await response.text()
      expect(csv).toContain('"Task with, comma"')
      expect(csv).toContain('"Description with, multiple, commas"')
    })
  })

  describe("Error Handling", () => {
    it("should handle database errors gracefully", async () => {
      vi.mocked(getServerSession).mockResolvedValue(mockSession as any)
      vi.mocked(prisma.user.findUnique).mockRejectedValue(new Error("Database error"))

      const request = new NextRequest("http://localhost:3000/api/account/export?format=json")
      const response = await GET(request)

      expect(response.status).toBe(500)
      expect(await response.text()).toBe("Internal Server Error")
    })
  })
})
