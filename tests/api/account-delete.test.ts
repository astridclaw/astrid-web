import { describe, it, expect, beforeEach, vi } from "vitest"
import { NextRequest } from "next/server"
import { POST } from "@/app/api/account/delete/route"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { del } from "@vercel/blob"
import bcrypt from "bcryptjs"

vi.mock("next-auth")
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      delete: vi.fn()
    }
  }
}))
vi.mock("@vercel/blob", () => ({
  del: vi.fn()
}))
vi.mock("bcryptjs")

describe("Account Delete API", () => {
  const mockSession = {
    user: {
      id: "user-123",
      email: "test@example.com"
    }
  }

  const mockPasswordUser = {
    id: "user-123",
    email: "test@example.com",
    password: "hashed-password",
    secureFiles: [
      { id: "file-1", blobUrl: "https://blob.vercel-storage.com/file1" },
      { id: "file-2", blobUrl: "https://blob.vercel-storage.com/file2" }
    ],
    accounts: []
  }

  const mockOAuthUser = {
    id: "user-123",
    email: "test@example.com",
    password: null,
    secureFiles: [],
    accounts: [
      { id: "account-1", provider: "google", providerAccountId: "12345" }
    ]
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("Authentication", () => {
    it("should require authentication", async () => {
      vi.mocked(getServerSession).mockResolvedValue(null)

      const request = new NextRequest("http://localhost:3000/api/account/delete", {
        method: "POST",
        body: JSON.stringify({
          confirmationText: "DELETE MY ACCOUNT",
          password: "password123"
        })
      })

      const response = await POST(request)

      expect(response.status).toBe(401)
      expect(await response.text()).toBe("Unauthorized")
    })
  })

  describe("Confirmation Validation", () => {
    it("should reject invalid confirmation text", async () => {
      vi.mocked(getServerSession).mockResolvedValue(mockSession as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockPasswordUser as any)

      const request = new NextRequest("http://localhost:3000/api/account/delete", {
        method: "POST",
        body: JSON.stringify({
          confirmationText: "delete my account",
          password: "password123"
        })
      })

      const response = await POST(request)

      expect(response.status).toBe(400)
      const error = await response.json()
      expect(error.error).toContain("Invalid confirmation text")
    })

    it("should accept exact confirmation text", async () => {
      vi.mocked(getServerSession).mockResolvedValue(mockSession as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockPasswordUser as any)
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never)
      vi.mocked(prisma.user.delete).mockResolvedValue({} as any)

      const request = new NextRequest("http://localhost:3000/api/account/delete", {
        method: "POST",
        body: JSON.stringify({
          confirmationText: "DELETE MY ACCOUNT",
          password: "password123"
        })
      })

      const response = await POST(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
    })
  })

  describe("Password Authentication", () => {
    it("should require password for email/password users", async () => {
      vi.mocked(getServerSession).mockResolvedValue(mockSession as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockPasswordUser as any)

      const request = new NextRequest("http://localhost:3000/api/account/delete", {
        method: "POST",
        body: JSON.stringify({
          confirmationText: "DELETE MY ACCOUNT"
        })
      })

      const response = await POST(request)

      expect(response.status).toBe(400)
      const error = await response.json()
      expect(error.error).toContain("Password required")
    })

    it("should reject invalid password", async () => {
      vi.mocked(getServerSession).mockResolvedValue(mockSession as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockPasswordUser as any)
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never)

      const request = new NextRequest("http://localhost:3000/api/account/delete", {
        method: "POST",
        body: JSON.stringify({
          confirmationText: "DELETE MY ACCOUNT",
          password: "wrong-password"
        })
      })

      const response = await POST(request)

      expect(response.status).toBe(401)
      const error = await response.json()
      expect(error.error).toBe("Invalid password")
    })

    it("should accept valid password", async () => {
      vi.mocked(getServerSession).mockResolvedValue(mockSession as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockPasswordUser as any)
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never)
      vi.mocked(prisma.user.delete).mockResolvedValue({} as any)

      const request = new NextRequest("http://localhost:3000/api/account/delete", {
        method: "POST",
        body: JSON.stringify({
          confirmationText: "DELETE MY ACCOUNT",
          password: "correct-password"
        })
      })

      const response = await POST(request)

      expect(response.status).toBe(200)
    })
  })

  describe("OAuth Users", () => {
    it("should allow deletion for OAuth users without password", async () => {
      vi.mocked(getServerSession).mockResolvedValue(mockSession as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockOAuthUser as any)
      vi.mocked(prisma.user.delete).mockResolvedValue({} as any)

      const request = new NextRequest("http://localhost:3000/api/account/delete", {
        method: "POST",
        body: JSON.stringify({
          confirmationText: "DELETE MY ACCOUNT"
        })
      })

      const response = await POST(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
    })
  })

  describe("File Cleanup", () => {
    it("should delete user files from blob storage", async () => {
      vi.mocked(getServerSession).mockResolvedValue(mockSession as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockPasswordUser as any)
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never)
      vi.mocked(prisma.user.delete).mockResolvedValue({} as any)
      vi.mocked(del).mockResolvedValue(undefined as never)

      const request = new NextRequest("http://localhost:3000/api/account/delete", {
        method: "POST",
        body: JSON.stringify({
          confirmationText: "DELETE MY ACCOUNT",
          password: "password123"
        })
      })

      await POST(request)

      expect(del).toHaveBeenCalledTimes(2)
      expect(del).toHaveBeenCalledWith("https://blob.vercel-storage.com/file1")
      expect(del).toHaveBeenCalledWith("https://blob.vercel-storage.com/file2")
    })

    it("should continue deletion even if file cleanup fails", async () => {
      vi.mocked(getServerSession).mockResolvedValue(mockSession as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockPasswordUser as any)
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never)
      vi.mocked(del).mockRejectedValue(new Error("File deletion failed") as never)
      vi.mocked(prisma.user.delete).mockResolvedValue({} as any)

      const request = new NextRequest("http://localhost:3000/api/account/delete", {
        method: "POST",
        body: JSON.stringify({
          confirmationText: "DELETE MY ACCOUNT",
          password: "password123"
        })
      })

      const response = await POST(request)

      expect(response.status).toBe(200)
      expect(prisma.user.delete).toHaveBeenCalled()
    })
  })

  describe("Account Deletion", () => {
    it("should delete user from database", async () => {
      vi.mocked(getServerSession).mockResolvedValue(mockSession as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockOAuthUser as any)
      vi.mocked(prisma.user.delete).mockResolvedValue({} as any)

      const request = new NextRequest("http://localhost:3000/api/account/delete", {
        method: "POST",
        body: JSON.stringify({
          confirmationText: "DELETE MY ACCOUNT"
        })
      })

      await POST(request)

      expect(prisma.user.delete).toHaveBeenCalledWith({
        where: { id: "user-123" }
      })
    })
  })

  describe("Error Handling", () => {
    it("should handle database errors", async () => {
      vi.mocked(getServerSession).mockResolvedValue(mockSession as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockOAuthUser as any)
      vi.mocked(prisma.user.delete).mockRejectedValue(new Error("Database error"))

      const request = new NextRequest("http://localhost:3000/api/account/delete", {
        method: "POST",
        body: JSON.stringify({
          confirmationText: "DELETE MY ACCOUNT"
        })
      })

      const response = await POST(request)

      expect(response.status).toBe(500)
      const error = await response.json()
      expect(error.error).toContain("Failed to delete account")
    })
  })
})
