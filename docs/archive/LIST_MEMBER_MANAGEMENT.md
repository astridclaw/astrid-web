# List Member Management

This document explains how to use the new list member management features.

## Features

### 📝 **Adding Members During List Creation/Editing**

When creating or editing a **shared list**, you'll see a "Members & Admins" section with:

1. **Text Input Box**: Type an email or user name to add members
   - Start typing and matching users will appear in a dropdown
   - Press Enter or click the "+" button to add them as members
   - Users are added as "members" by default

2. **Live User Search**: As you type, the system searches for:
   - User names (partial matches)
   - Email addresses (partial matches)

### 👥 **Managing Existing Members**

Each member is displayed with:
- **Avatar and Name**: Visual identification
- **Email**: Contact information  
- **Role Badge**: Shows current role (Owner, Admin, Member)
- **Action Buttons**: 
  - **↑** Promote member to admin (if you're owner)
  - **↓** Demote admin to member  
  - **✕** Remove member from list

### 🔐 **Permission System**

**Owner (Yellow Badge)**:
- Full control over the list
- Can add/remove any members
- Can promote members to admins
- Can delete the list

**Admin/Manager (Blue Badge)**:
- Can manage list settings
- Can add/remove members
- Can assign tasks
- Can promote members (if they're owner)

**Member (Green Badge)**:
- Can add, edit, and manage tasks
- Can view all list members
- Can leave the list

### 🚀 **Quick Actions**

1. **Add by Email**: Type `user@example.com` and press Enter
2. **Add by Name**: Type `John Smith` and select from dropdown  
3. **Invite New Users**: Type `newuser@example.com` to send email invitation
4. **Promote to Admin**: Click ↑ next to member's name
5. **Remove Member**: Click ✕ next to member's name

### 💡 **Tips**

- **Start typing** in the member input to see available users
- **Members can leave** by clicking the remove button on themselves
- **Only owners** can promote members to admins
- **Admins can manage** other members but not other admins (unless they're the owner)

## Example Workflow

1. **Create a new shared list**
2. **Add existing user Sarah**: Type "sarah@example.com" → Press Enter → Added instantly
3. **Invite new user**: Type "newuser@company.com" → Press Enter → Invitation sent via email
4. **Promote Sarah to admin**: Click ↑ next to Sarah's name
5. **Remove a member**: Click ✕ next to their name
6. **Member leaves**: They click ✕ next to their own name

### 📧 **Invitation Process**

For **existing users**: Added immediately to the list
For **new users**: 
1. Email invitation sent automatically
2. Shows as "Pending Invitation" in member list
3. User receives email with accept/decline link
4. Once accepted, they become active member
5. Until accepted, they can't be promoted/demoted

## API Integration

The system automatically:
- **Sends email invitations** to new members
- **Updates permissions** in real-time
- **Syncs with the database** immediately
- **Handles existing users** vs new invitations seamlessly

## Security

- **Role-based access**: Users can only perform actions their role allows
- **Email verification**: Invitations require email confirmation
- **Owner protection**: List owners cannot be removed
- **Self-removal**: Users can always leave lists they're members of
