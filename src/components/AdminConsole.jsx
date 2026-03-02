/*****************************************************************************************
  ADMIN CONSOLE COMPONENT
  ----------------------------------------------------------------------------------------
  Full admin interface for the Business Input Portal.

  Tabs:
    1. User Management     → Add, edit, remove users. Assign roles + divisions.
    2. Roles & Permissions → View what each role can do.
    3. Audit Log           → Read-only log of all actions.

  Props:
    user      (Object)   → logged-in user from /.auth/me
    onLogout  (Function) → callback to handle logout from parent App.jsx

  Styling:
    Matches existing app aesthetic:
      - Steve Madden background image
      - White frosted glass card
      - Black/white color scheme
      - Montserrat font
      - Pill-shaped buttons
*****************************************************************************************/

import { useState, useEffect } from "react";
import {
  getUsers,
  saveUsers,
  getAuditLog,
  appendAuditLog
} from "../utils/adminStorage";

/*****************************************************************************************
  CONSTANTS
  ----------------------------------------------------------------------------------------
  Centralized config for roles, divisions, permissions.
  In a future version these can be fetched from config.json via getConfig().
*****************************************************************************************/

const ALL_DIVISIONS = ["SAF", "F9A", "F9B", "NAF", "EMEA", "APAC", "LATAM"];

const ALL_ROLES = [
  {
    id: "admin",
    label: "Admin",
    description: "Full access including user management and audit log"
  },
  {
    id: "editor",
    label: "Editor",
    description: "Can view and submit Business Input forms for assigned divisions"
  },
  {
    id: "viewer",
    label: "Viewer",
    description: "Read-only access to assigned divisions"
  }
];

// What each role can and cannot do
const ROLE_PERMISSIONS = {
  admin: {
    "View Business Input":  true,
    "Submit Forecast":      true,
    "Submit Plan":          true,
    "Edit Submissions":     true,
    "Delete Submissions":   true,
    "Download Data":        true,
    "User Management":      true,
    "Role Management":      true,
    "Audit Log Access":     true,
    "System Settings":      true,
    "Export All Data":      true,
    "Manage Divisions":     true
  },
  editor: {
    "View Business Input":  true,
    "Submit Forecast":      true,
    "Submit Plan":          true,
    "Edit Submissions":     false,
    "Delete Submissions":   false,
    "Download Data":        true,
    "User Management":      false,
    "Role Management":      false,
    "Audit Log Access":     false,
    "System Settings":      false,
    "Export All Data":      false,
    "Manage Divisions":     false
  },
  viewer: {
    "View Business Input":  true,
    "Submit Forecast":      false,
    "Submit Plan":          false,
    "Edit Submissions":     false,
    "Delete Submissions":   false,
    "Download Data":        true,
    "User Management":      false,
    "Role Management":      false,
    "Audit Log Access":     false,
    "System Settings":      false,
    "Export All Data":      false,
    "Manage Divisions":     false
  }
};

// Badge colors per role
const ROLE_BADGE_STYLE = {
  admin:  { background: "#111",    color: "white" },
  editor: { background: "#e0f2fe", color: "#0369a1" },
  viewer: { background: "#f3f4f6", color: "#6b7280" }
};

// Badge colors per status
const STATUS_BADGE_STYLE = {
  active:   { background: "#dcfce7", color: "#16a34a" },
  inactive: { background: "#f3f4f6", color: "#9ca3af" }
};

// Badge colors per audit action
const ACTION_BADGE_STYLE = {
  submit:       { background: "#dcfce7", color: "#15803d" },
  login:        { background: "#e0f2fe", color: "#0369a1" },
  user_added:   { background: "#fef3c7", color: "#b45309" },
  user_removed: { background: "#fee2e2", color: "#dc2626" },
  role_edited:  { background: "#f3e8ff", color: "#7e22ce" },
  user_edited:  { background: "#f3e8ff", color: "#7e22ce" }
};

const ACTION_BADGE_LABEL = {
  submit:       "Submitted",
  login:        "Login",
  user_added:   "User Added",
  user_removed: "User Removed",
  role_edited:  "Role Edited",
  user_edited:  "User Edited"
};

/*****************************************************************************************
  HELPER — getInitials
  ----------------------------------------------------------------------------------------
  Returns 2-letter initials from first + last name.
  Fallback to first 2 chars of email.
*****************************************************************************************/
const getInitials = (user) => {
  if (user.firstName && user.lastName) {
    return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
  }
  return user.email.substring(0, 2).toUpperCase();
};

/*****************************************************************************************
  HELPER — formatTimestamp
  ----------------------------------------------------------------------------------------
  Converts ISO string to readable format.
  e.g. "2026-03-02T09:42:11.000Z" → "Mar 2, 2026, 9:42 AM"
*****************************************************************************************/
const formatTimestamp = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  } catch {
    return iso;
  }
};

/*****************************************************************************************
  EMPTY USER TEMPLATE
  ----------------------------------------------------------------------------------------
  Used when opening the Add User modal.
*****************************************************************************************/
const emptyUser = () => ({
  id: "",
  firstName: "",
  lastName: "",
  email: "",
  role: "editor",
  divisions: [],
  permissions: {
    businessInput:  true,
    forecastEdit:   true,
    planEdit:       false,
    adminReports:   false
  },
  loginMethod: "microsoft",
  status: "active",
  lastActive: null,
  createdAt: new Date().toISOString()
});

/*****************************************************************************************
  MAIN COMPONENT — AdminConsole
*****************************************************************************************/
export default function AdminConsole({ user, onLogout }) {

  /***************************************************************************************
    STATE
  ***************************************************************************************/

  // Which tab is active
  const [activeTab, setActiveTab] = useState("users");

  // Full user list from blob
  const [users, setUsers] = useState([]);

  // Audit log from blob
  const [auditLog, setAuditLog] = useState([]);

  // Loading states
  const [loadingUsers, setLoadingUsers]   = useState(true);
  const [loadingAudit, setLoadingAudit]   = useState(false);
  const [savingUser,   setSavingUser]     = useState(false);

  // Search filter for user table
  const [searchTerm, setSearchTerm] = useState("");

  // Which role is selected in the Roles tab
  const [selectedRole, setSelectedRole] = useState("editor");

  // Add/Edit User modal state
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser,   setEditingUser]   = useState(null); // null = adding new
  const [modalForm,     setModalForm]     = useState(emptyUser());
  const [modalError,    setModalError]    = useState("");

  // Remove confirmation
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [userToRemove,      setUserToRemove]       = useState(null);

  // Audit filters
  const [auditFilterAction,   setAuditFilterAction]   = useState("all");
  const [auditFilterUser,     setAuditFilterUser]     = useState("all");
  const [auditFilterDivision, setAuditFilterDivision] = useState("all");

  // Fade in animation
  const [fadeIn, setFadeIn] = useState(false);

  /***************************************************************************************
    EFFECTS
  ***************************************************************************************/

  // Fade in on mount
  useEffect(() => {
    const t = setTimeout(() => setFadeIn(true), 50);
    return () => clearTimeout(t);
  }, []);

  // Load users on mount
  useEffect(() => {
    loadUsers();
  }, []);

  // Load audit log when tab switches to audit
  useEffect(() => {
    if (activeTab === "audit" && auditLog.length === 0) {
      loadAuditLog();
    }
  }, [activeTab]);

  // Lock body scroll when modal open
  useEffect(() => {
    document.body.style.overflow =
      (showUserModal || showRemoveConfirm) ? "hidden" : "auto";
    return () => { document.body.style.overflow = "auto"; };
  }, [showUserModal, showRemoveConfirm]);

  /***************************************************************************************
    DATA LOADERS
  ***************************************************************************************/

  const loadUsers = async () => {
    setLoadingUsers(true);
    const data = await getUsers();
    setUsers(data);
    setLoadingUsers(false);
  };

  const loadAuditLog = async () => {
    setLoadingAudit(true);
    const data = await getAuditLog();
    setAuditLog(data);
    setLoadingAudit(false);
  };

  /***************************************************************************************
    USER MANAGEMENT ACTIONS
  ***************************************************************************************/

  // Open modal to ADD a new user
  const openAddModal = () => {
    setEditingUser(null);
    setModalForm(emptyUser());
    setModalError("");
    setShowUserModal(true);
  };

  // Open modal to EDIT an existing user
  const openEditModal = (u) => {
    setEditingUser(u);
    setModalForm({ ...u });
    setModalError("");
    setShowUserModal(true);
  };

  // Handle modal form field changes
  const handleModalField = (field, value) => {
    setModalForm((prev) => ({ ...prev, [field]: value }));
  };

  // Toggle a division in the modal form
  const toggleDivision = (div) => {
    setModalForm((prev) => {
      const exists = prev.divisions.includes(div);
      return {
        ...prev,
        divisions: exists
          ? prev.divisions.filter((d) => d !== div)
          : [...prev.divisions, div]
      };
    });
  };

  // Toggle a permission in the modal form
  const togglePermission = (key) => {
    setModalForm((prev) => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [key]: !prev.permissions[key]
      }
    }));
  };

  // Validate modal form before save
  const validateModal = () => {
    if (!modalForm.firstName.trim()) return "First name is required.";
    if (!modalForm.lastName.trim())  return "Last name is required.";
    if (!modalForm.email.trim())     return "Email is required.";
    if (!/\S+@\S+\.\S+/.test(modalForm.email)) return "Enter a valid email.";
    if (modalForm.divisions.length === 0) return "Select at least one division.";

    // Check duplicate email (only when adding new)
    if (!editingUser) {
      const exists = users.find(
        (u) => u.email.toLowerCase() === modalForm.email.toLowerCase()
      );
      if (exists) return "A user with this email already exists.";
    }

    return "";
  };

  // Save user (add or edit)
  const saveUser = async () => {
    const error = validateModal();
    if (error) {
      setModalError(error);
      return;
    }

    setSavingUser(true);

    let updatedUsers;
    let auditAction;
    let auditDetails;

    if (editingUser) {
      // EDIT existing user
      updatedUsers = users.map((u) =>
        u.id === editingUser.id ? { ...modalForm, id: editingUser.id } : u
      );
      auditAction  = "user_edited";
      auditDetails = `Edited user: ${modalForm.email} (Role: ${modalForm.role})`;
    } else {
      // ADD new user
      const newUser = {
        ...modalForm,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        lastActive: null
      };
      updatedUsers = [...users, newUser];
      auditAction  = "user_added";
      auditDetails = `Added ${modalForm.email} as ${modalForm.role}`;
    }

    const success = await saveUsers(updatedUsers);

    if (success) {
      setUsers(updatedUsers);
      setShowUserModal(false);

      // Write audit entry
      await appendAuditLog({
        action:      auditAction,
        performedBy: user?.userDetails || "admin",
        details:     auditDetails,
        division:    modalForm.divisions.join(", ") || "—"
      });

      // Refresh audit if tab is open
      if (activeTab === "audit") loadAuditLog();
    } else {
      setModalError("Failed to save. Please try again.");
    }

    setSavingUser(false);
  };

  // Confirm remove user
  const confirmRemove = (u) => {
    setUserToRemove(u);
    setShowRemoveConfirm(true);
  };

  // Execute remove user
  const removeUser = async () => {
    if (!userToRemove) return;

    const updatedUsers = users.filter((u) => u.id !== userToRemove.id);
    const success = await saveUsers(updatedUsers);

    if (success) {
      setUsers(updatedUsers);
      await appendAuditLog({
        action:      "user_removed",
        performedBy: user?.userDetails || "admin",
        details:     `Removed user: ${userToRemove.email}`,
        division:    "—"
      });
      if (activeTab === "audit") loadAuditLog();
    }

    setShowRemoveConfirm(false);
    setUserToRemove(null);
  };

  /***************************************************************************************
    DERIVED DATA
  ***************************************************************************************/

  // Filtered users based on search
  const filteredUsers = users.filter((u) => {
    const term = searchTerm.toLowerCase();
    return (
      !term ||
      u.email.toLowerCase().includes(term) ||
      (u.firstName + " " + u.lastName).toLowerCase().includes(term) ||
      u.role.toLowerCase().includes(term)
    );
  });

  // Filtered audit log
  const filteredAudit = auditLog.filter((entry) => {
    const matchAction   = auditFilterAction   === "all" || entry.action   === auditFilterAction;
    const matchUser     = auditFilterUser     === "all" || entry.performedBy === auditFilterUser;
    const matchDivision = auditFilterDivision === "all" || (entry.division || "").includes(auditFilterDivision);
    return matchAction && matchUser && matchDivision;
  });

  // Unique users in audit log for filter dropdown
  const auditUsers = [...new Set(auditLog.map((e) => e.performedBy).filter(Boolean))];

  /***************************************************************************************
    SHARED STYLES
  ***************************************************************************************/

  const styles = {
    // Outer full-screen wrapper
    wrapper: {
      minHeight: "100vh",
      width: "100vw",
      display: "flex",
      justifyContent: "center",
      backgroundImage: "url('/background.jpg')",
      backgroundSize: "cover",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "center",
      fontFamily: "'Montserrat', sans-serif",
      padding: "40px 20px",
      boxSizing: "border-box",
      opacity: fadeIn ? 1 : 0,
      transition: "opacity 0.4s ease, transform 0.4s ease",
      transform: fadeIn ? "translateY(0px)" : "translateY(10px)"
    },

    // Main white card
    card: {
      background: "rgba(255,255,255,0.92)",
      backdropFilter: "blur(8px)",
      padding: "40px",
      borderRadius: "20px",
      width: "100%",
      maxWidth: "1000px",
      boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
      position: "relative",
      alignSelf: "flex-start"
    },

    // Top-right user badge
    userBadge: {
      position: "absolute",
      top: "20px",
      right: "28px",
      fontSize: "12px",
      color: "#555",
      display: "flex",
      alignItems: "center",
      gap: "6px"
    },

    // Tab bar
    tabs: {
      display: "flex",
      borderBottom: "2px solid #e0e0e0",
      marginBottom: "28px",
      gap: 0
    },

    tab: (isActive) => ({
      padding: "10px 22px",
      fontSize: "13px",
      fontWeight: "600",
      color: isActive ? "#111" : "#888",
      cursor: "pointer",
      borderBottom: isActive ? "3px solid #111" : "3px solid transparent",
      marginBottom: "-2px",
      transition: "all 0.2s",
      background: "none",
      border: "none",
      borderBottom: isActive ? "3px solid #111" : "3px solid transparent",
      fontFamily: "inherit"
    }),

    // Black pill button
    btnPrimary: {
      padding: "9px 20px",
      borderRadius: "25px",
      border: "none",
      background: "#111",
      color: "white",
      fontSize: "13px",
      fontWeight: "600",
      cursor: "pointer",
      fontFamily: "inherit"
    },

    // Outline pill button
    btnOutline: {
      padding: "9px 20px",
      borderRadius: "25px",
      border: "1.5px solid #111",
      background: "white",
      color: "#111",
      fontSize: "13px",
      fontWeight: "600",
      cursor: "pointer",
      fontFamily: "inherit"
    },

    // Small grey button
    btnEdit: {
      padding: "4px 12px",
      borderRadius: "6px",
      border: "1px solid #ddd",
      background: "#f0f0f0",
      color: "#333",
      fontSize: "11px",
      fontWeight: "600",
      cursor: "pointer",
      fontFamily: "inherit"
    },

    // Small red button
    btnDanger: {
      padding: "4px 12px",
      borderRadius: "6px",
      border: "1px solid #fca5a5",
      background: "#fee2e2",
      color: "#dc2626",
      fontSize: "11px",
      fontWeight: "600",
      cursor: "pointer",
      fontFamily: "inherit"
    },

    // Search input
    searchInput: {
      flex: 1,
      border: "none",
      outline: "none",
      fontSize: "13px",
      color: "#333",
      background: "transparent",
      fontFamily: "inherit"
    },

    // Table header cell
    th: {
      padding: "10px 12px",
      textAlign: "left",
      fontWeight: "600",
      fontSize: "11px",
      letterSpacing: "0.4px",
      textTransform: "uppercase",
      background: "#111",
      color: "white",
      whiteSpace: "nowrap"
    },

    // Table body cell
    td: {
      padding: "10px 12px",
      color: "#333",
      fontSize: "12px",
      verticalAlign: "middle",
      borderBottom: "1px solid #f2f2f2",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },

    // Section heading inside panels
    sectionTitle: {
      fontSize: "11px",
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: "0.6px",
      color: "#999",
      marginBottom: "10px",
      paddingBottom: "6px",
      borderBottom: "1px solid #f0f0f0"
    },

    // Form label in modal
    label: {
      display: "block",
      fontSize: "11px",
      fontWeight: "700",
      color: "#555",
      marginBottom: "6px",
      textTransform: "uppercase",
      letterSpacing: "0.4px"
    },

    // Form input in modal
    input: {
      width: "100%",
      padding: "9px 14px",
      border: "1.5px solid #e0e0e0",
      borderRadius: "8px",
      fontSize: "13px",
      color: "#333",
      outline: "none",
      background: "white",
      fontFamily: "inherit",
      boxSizing: "border-box"
    },

    // Form select in modal
    select: {
      width: "100%",
      padding: "9px 14px",
      border: "1.5px solid #e0e0e0",
      borderRadius: "8px",
      fontSize: "13px",
      color: "#333",
      outline: "none",
      background: "white",
      fontFamily: "inherit",
      boxSizing: "border-box",
      appearance: "none"
    }
  };

  /***************************************************************************************
    RENDER — USER MANAGEMENT TAB
  ***************************************************************************************/
  const renderUsersTab = () => (
    <div>
      {/* TOOLBAR */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px", gap: "12px" }}>
        {/* Search box */}
        <div style={{ display: "flex", alignItems: "center", border: "1.5px solid #ddd", borderRadius: "8px", padding: "8px 14px", gap: "8px", flex: 1, maxWidth: "320px", background: "white" }}>
          <span style={{ color: "#aaa" }}>🔍</span>
          <input
            style={styles.searchInput}
            placeholder="Search by name, email or role..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: "8px" }}>
          <button style={{ ...styles.btnOutline, fontSize: "12px", padding: "7px 16px" }}>
            Export
          </button>
          <button
            style={{ ...styles.btnPrimary, fontSize: "12px", padding: "7px 16px" }}
            onClick={openAddModal}
          >
            + Add User
          </button>
        </div>
      </div>

      {/* USER TABLE */}
      {loadingUsers ? (
        <div style={{ textAlign: "center", padding: "40px", color: "#888" }}>Loading users...</div>
      ) : (
        <div style={{ borderRadius: "8px", overflow: "hidden", border: "1px solid #e8e8e8" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "18%" }} />
              <col style={{ width: "24%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "17%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "13%" }} />
            </colgroup>
            <thead>
              <tr>
                {["User", "Email", "Role", "Divisions", "Status", "Last Active", "Actions"].map((h) => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ ...styles.td, textAlign: "center", padding: "40px", color: "#aaa" }}>
                    {searchTerm ? "No users match your search." : "No users yet. Click + Add User to get started."}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <tr key={u.id} style={{ background: "white" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "#fafafa"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "white"}
                  >
                    {/* Name + avatar */}
                    <td style={styles.td}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "#e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: "700", color: "#555", flexShrink: 0 }}>
                          {getInitials(u)}
                        </div>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                          {u.firstName} {u.lastName}
                        </span>
                      </div>
                    </td>

                    {/* Email */}
                    <td style={styles.td}>{u.email}</td>

                    {/* Role badge */}
                    <td style={styles.td}>
                      <span style={{ ...ROLE_BADGE_STYLE[u.role], display: "inline-block", padding: "2px 8px", borderRadius: "20px", fontSize: "10.5px", fontWeight: "600" }}>
                        {u.role.charAt(0).toUpperCase() + u.role.slice(1)}
                      </span>
                    </td>

                    {/* Divisions */}
                    <td style={styles.td}>
                      {u.divisions?.join(", ") || "—"}
                    </td>

                    {/* Status badge */}
                    <td style={styles.td}>
                      <span style={{ ...(STATUS_BADGE_STYLE[u.status] || STATUS_BADGE_STYLE.inactive), display: "inline-block", padding: "2px 8px", borderRadius: "20px", fontSize: "10.5px", fontWeight: "600" }}>
                        {u.status === "active" ? "Active" : "Inactive"}
                      </span>
                    </td>

                    {/* Last active */}
                    <td style={styles.td}>
                      {u.lastActive ? formatTimestamp(u.lastActive) : "Never"}
                    </td>

                    {/* Actions */}
                    <td style={styles.td}>
                      <div style={{ display: "flex", gap: "5px" }}>
                        <button style={styles.btnEdit} onClick={() => openEditModal(u)}>Edit</button>
                        <button style={styles.btnDanger} onClick={() => confirmRemove(u)}>Remove</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination info */}
      {!loadingUsers && filteredUsers.length > 0 && (
        <div style={{ marginTop: "14px", fontSize: "12px", color: "#888" }}>
          Showing {filteredUsers.length} of {users.length} user{users.length !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );

  /***************************************************************************************
    RENDER — ROLES & PERMISSIONS TAB
  ***************************************************************************************/
  const renderRolesTab = () => {
    const perms = ROLE_PERMISSIONS[selectedRole];
    const permKeys = Object.keys(perms);
    const formAccess  = permKeys.slice(0, 6);
    const adminAccess = permKeys.slice(6);

    return (
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: "24px" }}>
        {/* Left: Role list */}
        <div style={{ border: "1.5px solid #e8e8e8", borderRadius: "10px", overflow: "hidden" }}>
          <div style={{ background: "#111", color: "white", padding: "12px 16px", fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Roles
          </div>
          {ALL_ROLES.map((role) => (
            <div
              key={role.id}
              onClick={() => setSelectedRole(role.id)}
              style={{
                padding: "13px 16px",
                borderBottom: "1px solid #f0f0f0",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: selectedRole === role.id ? "600" : "400",
                color: selectedRole === role.id ? "#111" : "#555",
                background: selectedRole === role.id ? "#f8f8f8" : "white",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}
            >
              <span>{role.label}</span>
              <span style={{
                background: selectedRole === role.id ? "#111" : "#e5e7eb",
                color: selectedRole === role.id ? "white" : "#6b7280",
                borderRadius: "10px",
                padding: "1px 8px",
                fontSize: "11px",
                fontWeight: "600"
              }}>
                {users.filter((u) => u.role === role.id).length}
              </span>
            </div>
          ))}
        </div>

        {/* Right: Permissions panel */}
        <div>
          {/* Role header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "18px" }}>
            <div>
              <div style={{ fontSize: "18px", fontWeight: "700", color: "#111" }}>
                {ALL_ROLES.find((r) => r.id === selectedRole)?.label} Role
              </div>
              <div style={{ fontSize: "12px", color: "#888", marginTop: "3px" }}>
                {ALL_ROLES.find((r) => r.id === selectedRole)?.description}
              </div>
            </div>
          </div>

          {/* Form Access permissions */}
          <div style={{ marginBottom: "20px" }}>
            <div style={styles.sectionTitle}>Form Access</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
              {formAccess.map((key) => (
                <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 13px", borderRadius: "8px", border: `1.5px solid ${perms[key] ? "#d1fae5" : "#f3f4f6"}`, background: perms[key] ? "#f0fdf4" : "#fafafa", opacity: perms[key] ? 1 : 0.65 }}>
                  <span style={{ fontSize: "12px", color: "#333", fontWeight: "500" }}>{key}</span>
                  <span style={{ color: perms[key] ? "#16a34a" : "#d1d5db", fontWeight: "700", fontSize: "14px" }}>
                    {perms[key] ? "✓" : "✗"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Admin Access permissions */}
          <div style={{ marginBottom: "20px" }}>
            <div style={styles.sectionTitle}>Admin Access</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
              {adminAccess.map((key) => (
                <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 13px", borderRadius: "8px", border: `1.5px solid ${perms[key] ? "#d1fae5" : "#f3f4f6"}`, background: perms[key] ? "#f0fdf4" : "#fafafa", opacity: perms[key] ? 1 : 0.65 }}>
                  <span style={{ fontSize: "12px", color: "#333", fontWeight: "500" }}>{key}</span>
                  <span style={{ color: perms[key] ? "#16a34a" : "#d1d5db", fontWeight: "700", fontSize: "14px" }}>
                    {perms[key] ? "✓" : "✗"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Division access */}
          <div>
            <div style={styles.sectionTitle}>
              Division Access — {ALL_ROLES.find((r) => r.id === selectedRole)?.label}s can access divisions assigned to them individually
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {ALL_DIVISIONS.map((div) => (
                <div key={div} style={{ padding: "5px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: "600", border: "1.5px solid", borderColor: selectedRole === "viewer" && div === "LATAM" ? "#e8e8e8" : "#111", background: selectedRole === "viewer" && div === "LATAM" ? "transparent" : "#111", color: selectedRole === "viewer" && div === "LATAM" ? "#bbb" : "white" }}>
                  {div}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  /***************************************************************************************
    RENDER — AUDIT LOG TAB
  ***************************************************************************************/
  const renderAuditTab = () => {
    // Stats
    const todayStr  = new Date().toDateString();
    const todayCount = auditLog.filter((e) => new Date(e.timestamp).toDateString() === todayStr).length;
    const activeUserCount = users.filter((u) => u.status === "active").length;
    const userChanges = auditLog.filter((e) => ["user_added", "user_removed", "user_edited"].includes(e.action)).length;

    return (
      <div>
        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "22px" }}>
          {[
            { num: todayCount,       label: "Actions Today" },
            { num: activeUserCount,  label: "Active Users" },
            { num: userChanges,      label: "User Changes" },
            { num: 0,                label: "Failed Logins" }
          ].map((s) => (
            <div key={s.label} style={{ background: "white", border: "1.5px solid #e8e8e8", borderRadius: "8px", padding: "14px 16px" }}>
              <div style={{ fontSize: "22px", fontWeight: "800", color: "#111" }}>{s.num}</div>
              <div style={{ fontSize: "11px", color: "#888", marginTop: "2px" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "16px", alignItems: "center", flexWrap: "wrap" }}>
          {/* Action filter */}
          <select style={{ ...styles.select, width: "auto", padding: "7px 12px" }}
            value={auditFilterAction} onChange={(e) => setAuditFilterAction(e.target.value)}>
            <option value="all">All Action Types</option>
            <option value="login">Login</option>
            <option value="submit">Submit</option>
            <option value="user_added">User Added</option>
            <option value="user_removed">User Removed</option>
            <option value="user_edited">User Edited</option>
            <option value="role_edited">Role Edited</option>
          </select>

          {/* User filter */}
          <select style={{ ...styles.select, width: "auto", padding: "7px 12px" }}
            value={auditFilterUser} onChange={(e) => setAuditFilterUser(e.target.value)}>
            <option value="all">All Users</option>
            {auditUsers.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>

          {/* Division filter */}
          <select style={{ ...styles.select, width: "auto", padding: "7px 12px" }}
            value={auditFilterDivision} onChange={(e) => setAuditFilterDivision(e.target.value)}>
            <option value="all">All Divisions</option>
            {ALL_DIVISIONS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>

          <div style={{ flex: 1 }} />

          <button
            style={{ ...styles.btnOutline, fontSize: "12px", padding: "7px 16px" }}
            onClick={loadAuditLog}
          >
            Refresh
          </button>
        </div>

        {/* Audit table */}
        {loadingAudit ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#888" }}>Loading audit log...</div>
        ) : (
          <div style={{ borderRadius: "8px", overflow: "hidden", border: "1px solid #e8e8e8" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "18%" }} />
                <col style={{ width: "18%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "33%" }} />
                <col style={{ width: "10%" }} />
              </colgroup>
              <thead>
                <tr>
                  {["Timestamp", "User", "Action", "Details", "Division"].map((h) => (
                    <th key={h} style={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredAudit.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ ...styles.td, textAlign: "center", padding: "40px", color: "#aaa" }}>
                      No audit entries found.
                    </td>
                  </tr>
                ) : (
                  filteredAudit.map((entry) => (
                    <tr key={entry.id} style={{ background: "white" }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "#fafafa"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "white"}
                    >
                      <td style={{ ...styles.td, fontFamily: "monospace", fontSize: "11px", color: "#888" }}>
                        {formatTimestamp(entry.timestamp)}
                      </td>
                      <td style={styles.td}>{entry.performedBy || "—"}</td>
                      <td style={styles.td}>
                        {entry.action && (
                          <span style={{ ...(ACTION_BADGE_STYLE[entry.action] || { background: "#f3f4f6", color: "#6b7280" }), display: "inline-block", padding: "2px 8px", borderRadius: "20px", fontSize: "10.5px", fontWeight: "600" }}>
                            {ACTION_BADGE_LABEL[entry.action] || entry.action}
                          </span>
                        )}
                      </td>
                      <td style={{ ...styles.td, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {entry.details || "—"}
                      </td>
                      <td style={styles.td}>{entry.division || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {!loadingAudit && filteredAudit.length > 0 && (
          <div style={{ marginTop: "14px", fontSize: "12px", color: "#888" }}>
            Showing {filteredAudit.length} of {auditLog.length} entries
          </div>
        )}
      </div>
    );
  };

  /***************************************************************************************
    RENDER — ADD / EDIT USER MODAL
  ***************************************************************************************/
  const renderUserModal = () => (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 9999, backdropFilter: "blur(4px)" }}>
      <div style={{ background: "white", borderRadius: "14px", width: "560px", maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 30px 80px rgba(0,0,0,0.3)", fontFamily: "inherit" }}>

        {/* Modal header */}
        <div style={{ background: "#111", color: "white", padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderRadius: "14px 14px 0 0" }}>
          <span style={{ fontSize: "15px", fontWeight: "700" }}>
            {editingUser ? "Edit User" : "Add New User"}
          </span>
          <button onClick={() => setShowUserModal(false)} style={{ background: "none", border: "none", color: "white", fontSize: "18px", cursor: "pointer", opacity: 0.7 }}>✕</button>
        </div>

        {/* Modal body */}
        <div style={{ padding: "24px" }}>

          {/* Error message */}
          {modalError && (
            <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#dc2626", padding: "10px 14px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px" }}>
              {modalError}
            </div>
          )}

          {/* Name row */}
          <div style={{ display: "flex", gap: "14px", marginBottom: "16px" }}>
            <div style={{ flex: 1 }}>
              <label style={styles.label}>First Name</label>
              <input style={styles.input} value={modalForm.firstName}
                onChange={(e) => handleModalField("firstName", e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={styles.label}>Last Name</label>
              <input style={styles.input} value={modalForm.lastName}
                onChange={(e) => handleModalField("lastName", e.target.value)} />
            </div>
          </div>

          {/* Email */}
          <div style={{ marginBottom: "16px" }}>
            <label style={styles.label}>Email Address</label>
            <input style={styles.input} type="email" value={modalForm.email}
              onChange={(e) => handleModalField("email", e.target.value)}
              disabled={!!editingUser} // Can't change email on edit
            />
          </div>

          {/* Login method + Role row */}
          <div style={{ display: "flex", gap: "14px", marginBottom: "16px" }}>
            <div style={{ flex: 1 }}>
              <label style={styles.label}>Login Method</label>
              <select style={styles.select} value={modalForm.loginMethod}
                onChange={(e) => handleModalField("loginMethod", e.target.value)}>
                <option value="microsoft">Microsoft SSO</option>
                <option value="guest">Guest Access</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={styles.label}>Role</label>
              <select style={styles.select} value={modalForm.role}
                onChange={(e) => handleModalField("role", e.target.value)}>
                <option value="viewer">Viewer – Read only</option>
                <option value="editor">Editor – Can submit data</option>
                <option value="admin">Admin – Full access</option>
              </select>
            </div>
          </div>

          {/* Status (edit only) */}
          {editingUser && (
            <div style={{ marginBottom: "16px" }}>
              <label style={styles.label}>Status</label>
              <select style={styles.select} value={modalForm.status}
                onChange={(e) => handleModalField("status", e.target.value)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          )}

          {/* Divider */}
          <div style={{ height: "1px", background: "#f0f0f0", margin: "18px 0" }} />

          {/* Two columns: Division + Permissions */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>

            {/* Division access */}
            <div>
              <div style={styles.sectionTitle}>Division Access</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "7px" }}>
                {ALL_DIVISIONS.map((div) => {
                  const selected = modalForm.divisions.includes(div);
                  return (
                    <div key={div} onClick={() => toggleDivision(div)} style={{ padding: "5px 13px", borderRadius: "6px", fontSize: "12px", fontWeight: "600", cursor: "pointer", border: "1.5px solid", borderColor: selected ? "#111" : "#ddd", background: selected ? "#111" : "transparent", color: selected ? "white" : "#555", transition: "all 0.15s" }}>
                      {div}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Form permissions */}
            <div>
              <div style={styles.sectionTitle}>Form Permissions</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "7px" }}>
                {[
                  { key: "businessInput", label: "Business Input" },
                  { key: "forecastEdit",  label: "Forecast Edit" },
                  { key: "planEdit",      label: "Plan Edit" },
                  { key: "adminReports",  label: "Admin Reports" }
                ].map(({ key, label }) => {
                  const on = modalForm.permissions?.[key];
                  return (
                    <div key={key} onClick={() => togglePermission(key)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 11px", borderRadius: "8px", border: `1.5px solid ${on ? "#111" : "#e8e8e8"}`, background: on ? "#f8f8f8" : "white", cursor: "pointer" }}>
                      <span style={{ fontSize: "12px", color: "#333" }}>{label}</span>
                      {/* Toggle switch */}
                      <div style={{ width: "32px", height: "18px", borderRadius: "9px", background: on ? "#111" : "#e0e0e0", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                        <div style={{ position: "absolute", top: "3px", left: on ? "16px" : "3px", width: "12px", height: "12px", borderRadius: "50%", background: "white", transition: "left 0.2s" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Modal footer */}
        <div style={{ padding: "16px 24px", background: "#fafafa", borderTop: "1px solid #eee", display: "flex", justifyContent: "flex-end", gap: "10px", borderRadius: "0 0 14px 14px" }}>
          <button style={styles.btnOutline} onClick={() => setShowUserModal(false)}>Cancel</button>
          <button style={styles.btnPrimary} onClick={saveUser} disabled={savingUser}>
            {savingUser ? "Saving..." : editingUser ? "Save Changes" : "Create User"}
          </button>
        </div>
      </div>
    </div>
  );

  /***************************************************************************************
    RENDER — REMOVE CONFIRM MODAL
  ***************************************************************************************/
  const renderRemoveConfirm = () => (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 9999, backdropFilter: "blur(4px)" }}>
      <div style={{ background: "white", borderRadius: "14px", width: "380px", padding: "32px 28px", textAlign: "center", boxShadow: "0 25px 70px rgba(0,0,0,0.25)" }}>
        <div style={{ fontSize: "28px", marginBottom: "12px" }}>⚠️</div>
        <h3 style={{ marginBottom: "10px", fontFamily: "inherit" }}>Remove User</h3>
        <p style={{ fontSize: "13px", color: "#555", marginBottom: "8px" }}>
          Are you sure you want to remove:
        </p>
        <p style={{ fontSize: "14px", fontWeight: "700", marginBottom: "24px" }}>
          {userToRemove?.firstName} {userToRemove?.lastName}<br />
          <span style={{ fontWeight: "400", color: "#888", fontSize: "12px" }}>{userToRemove?.email}</span>
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: "12px" }}>
          <button style={styles.btnOutline} onClick={() => setShowRemoveConfirm(false)}>Cancel</button>
          <button style={{ ...styles.btnPrimary, background: "#dc2626" }} onClick={removeUser}>Remove</button>
        </div>
      </div>
    </div>
  );

  /***************************************************************************************
    MAIN RENDER
  ***************************************************************************************/
  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>

        {/* Top-right user badge */}
        <div style={styles.userBadge}>
          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#111" }} />
          {user?.userDetails || "Admin User"}
        </div>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "8px" }}>
          <img src="/stevemadden-logo.png" alt="Steve Madden" style={{ height: "60px" }} />
        </div>

        {/* Title */}
        <h1 style={{ fontSize: "26px", fontWeight: "700", color: "#111", marginBottom: "6px" }}>
          Admin Console
        </h1>
        <p style={{ fontSize: "13px", color: "#888", marginBottom: "28px" }}>
          Manage users, roles, and access permissions
        </p>

        {/* Tab bar */}
        <div style={styles.tabs}>
          {[
            { id: "users",  label: "User Management" },
            { id: "roles",  label: "Roles & Permissions" },
            { id: "audit",  label: "Audit Log" }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={styles.tab(activeTab === tab.id)}
            >
              {tab.label}
            </button>
          ))}

          {/* Logout pushed to right */}
          <div style={{ flex: 1 }} />
          <button
            onClick={onLogout}
            style={{ ...styles.btnOutline, fontSize: "12px", padding: "6px 16px", alignSelf: "center", marginBottom: "4px" }}
          >
            Logout
          </button>
        </div>

        {/* Tab content */}
        {activeTab === "users" && renderUsersTab()}
        {activeTab === "roles" && renderRolesTab()}
        {activeTab === "audit" && renderAuditTab()}
      </div>

      {/* Modals */}
      {showUserModal    && renderUserModal()}
      {showRemoveConfirm && renderRemoveConfirm()}
    </div>
  );
}
