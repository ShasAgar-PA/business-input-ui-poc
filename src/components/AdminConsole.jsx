/*****************************************************************************************
  ADMIN CONSOLE COMPONENT — Phase 1 Complete
  ----------------------------------------------------------------------------------------
  Tabs:
    1. User Management     → Add, edit, remove users
    2. Roles & Permissions → View role permission matrix
    3. Submissions         → View all past submissions
    4. Configuration       → Manage Business Types, Divisions, Years
    5. Audit Log           → Read-only activity log
*****************************************************************************************/

import { useState, useEffect } from "react";
import {
  getUsers, saveUsers,
  getAuditLog, appendAuditLog,
  getConfig, saveConfig,
  getSubmissionsIndex
} from "../utils/adminStorage";

/*****************************************************************************************
  CONSTANTS
*****************************************************************************************/

const ALL_ROLES = [
  { id: "admin",  label: "Admin",  description: "Full access including user management and audit log" },
  { id: "editor", label: "Editor", description: "Can view and submit Business Input forms for assigned divisions" },
  { id: "viewer", label: "Viewer", description: "Read-only access to assigned divisions" }
];

const ROLE_PERMISSIONS = {
  admin: {
    "View Business Input": true,  "Submit Forecast":  true,
    "Submit Plan":         true,  "Edit Submissions": true,
    "Delete Submissions":  true,  "Download Data":    true,
    "User Management":     true,  "Role Management":  true,
    "Audit Log Access":    true,  "System Settings":  true,
    "Export All Data":     true,  "Manage Divisions": true
  },
  editor: {
    "View Business Input": true,  "Submit Forecast":  true,
    "Submit Plan":         true,  "Edit Submissions": false,
    "Delete Submissions":  false, "Download Data":    true,
    "User Management":     false, "Role Management":  false,
    "Audit Log Access":    false, "System Settings":  false,
    "Export All Data":     false, "Manage Divisions": false
  },
  viewer: {
    "View Business Input": true,  "Submit Forecast":  false,
    "Submit Plan":         false, "Edit Submissions": false,
    "Delete Submissions":  false, "Download Data":    true,
    "User Management":     false, "Role Management":  false,
    "Audit Log Access":    false, "System Settings":  false,
    "Export All Data":     false, "Manage Divisions": false
  }
};

const ACTION_BADGE = {
  submit:       { bg: "#dcfce7", color: "#15803d", label: "Submitted"    },
  login:        { bg: "#e0f2fe", color: "#0369a1", label: "Login"        },
  user_added:   { bg: "#fef3c7", color: "#b45309", label: "User Added"   },
  user_removed: { bg: "#fee2e2", color: "#dc2626", label: "User Removed" },
  role_edited:  { bg: "#f3e8ff", color: "#7e22ce", label: "Role Edited"  },
  user_edited:  { bg: "#f3e8ff", color: "#7e22ce", label: "User Edited"  },
  config_saved: { bg: "#fef3c7", color: "#b45309", label: "Config Saved" }
};

/*****************************************************************************************
  HELPERS
*****************************************************************************************/

const getInitials = (u) => {
  if (u.firstName && u.lastName)
    return `${u.firstName[0]}${u.lastName[0]}`.toUpperCase();
  return u.email.substring(0, 2).toUpperCase();
};

const formatTimestamp = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit"
    });
  } catch { return iso; }
};

const emptyUser = () => ({
  id: "", firstName: "", lastName: "", email: "",
  role: "editor", divisions: [],
  permissions: { businessInput: true, forecastEdit: true, planEdit: false, adminReports: false },
  loginMethod: "microsoft", status: "active",
  lastActive: null, createdAt: new Date().toISOString()
});

/*****************************************************************************************
  SHARED STYLES — all colors use CSS variables for dark mode
*****************************************************************************************/
const S = {
  th: {
    padding: "10px 12px", textAlign: "left",
    fontWeight: "600", fontSize: "11px",
    letterSpacing: "0.4px", textTransform: "uppercase",
    background: "var(--bg-table-header)",
    color: "var(--text-table-header)", whiteSpace: "nowrap"
  },
  td: {
    padding: "10px 12px",
    color: "var(--text-primary)",
    fontSize: "12px", verticalAlign: "middle",
    borderBottom: "1px solid var(--border-divider)",
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
  },
  // No overflow hidden — fixes Remove button being cut off
  tdActions: {
    padding: "10px 12px",
    color: "var(--text-primary)",
    fontSize: "12px", verticalAlign: "middle",
    borderBottom: "1px solid var(--border-divider)",
    whiteSpace: "nowrap"
  },
  input: {
    width: "100%", padding: "9px 14px",
    border: "1.5px solid var(--input-border)",
    borderRadius: "8px", fontSize: "13px",
    color: "var(--input-text)", outline: "none",
    background: "var(--input-bg)", fontFamily: "inherit",
    boxSizing: "border-box"
  },
  select: {
    width: "100%", padding: "9px 14px",
    border: "1.5px solid var(--input-border)",
    borderRadius: "8px", fontSize: "13px",
    color: "var(--input-text)", outline: "none",
    background: "var(--input-bg)", fontFamily: "inherit",
    boxSizing: "border-box", appearance: "none"
  },
  label: {
    display: "block", fontSize: "11px",
    fontWeight: "700", color: "var(--text-secondary)",
    marginBottom: "6px", textTransform: "uppercase",
    letterSpacing: "0.4px"
  },
  sectionTitle: {
    fontSize: "11px", fontWeight: "700",
    textTransform: "uppercase", letterSpacing: "0.6px",
    color: "var(--text-muted)", marginBottom: "10px",
    paddingBottom: "6px",
    borderBottom: "1px solid var(--border-divider)"
  },
  btnPrimary: {
    padding: "9px 20px", borderRadius: "25px", border: "none",
    background: "var(--btn-primary-bg)", color: "var(--btn-primary-text)",
    fontSize: "13px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit"
  },
  btnOutline: {
    padding: "9px 20px", borderRadius: "25px",
    border: "1.5px solid var(--btn-outline-border)",
    background: "var(--btn-outline-bg)", color: "var(--btn-outline-text)",
    fontSize: "13px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit"
  },
  btnEdit: {
    padding: "4px 12px", borderRadius: "6px",
    border: "1px solid var(--btn-edit-border)",
    background: "var(--btn-edit-bg)", color: "var(--btn-edit-text)",
    fontSize: "11px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit"
  },
  btnDanger: {
    padding: "4px 12px", borderRadius: "6px",
    border: "1px solid var(--btn-danger-border)",
    background: "var(--btn-danger-bg)", color: "var(--btn-danger-text)",
    fontSize: "11px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit"
  }
};

/*****************************************************************************************
  BADGE COMPONENTS
*****************************************************************************************/

const RoleBadge = ({ role }) => {
  const map = {
    admin:  { bg: "var(--badge-admin-bg)",  color: "var(--badge-admin-text)"  },
    editor: { bg: "var(--badge-editor-bg)", color: "var(--badge-editor-text)" },
    viewer: { bg: "var(--badge-viewer-bg)", color: "var(--badge-viewer-text)" }
  };
  const style = map[role] || map.viewer;
  return (
    <span style={{ background: style.bg, color: style.color, display: "inline-block", padding: "2px 8px", borderRadius: "20px", fontSize: "10.5px", fontWeight: "600" }}>
      {role.charAt(0).toUpperCase() + role.slice(1)}
    </span>
  );
};

const StatusBadge = ({ status }) => {
  const active = status === "active";
  return (
    <span style={{
      background: active ? "var(--badge-active-bg)"    : "var(--badge-inactive-bg)",
      color:      active ? "var(--badge-active-text)"  : "var(--badge-inactive-text)",
      display: "inline-block", padding: "2px 8px",
      borderRadius: "20px", fontSize: "10.5px", fontWeight: "600"
    }}>
      {active ? "Active" : "Inactive"}
    </span>
  );
};

const ActionBadge = ({ action }) => {
  const b = ACTION_BADGE[action] || { bg: "var(--badge-viewer-bg)", color: "var(--badge-viewer-text)", label: action };
  return (
    <span style={{ background: b.bg, color: b.color, display: "inline-block", padding: "2px 8px", borderRadius: "20px", fontSize: "10.5px", fontWeight: "600" }}>
      {b.label}
    </span>
  );
};

/*****************************************************************************************
  MAIN COMPONENT
*****************************************************************************************/
export default function AdminConsole({ user, onLogout }) {

  // Tab state
  const [activeTab, setActiveTab] = useState("users");

  // Data
  const [users,       setUsers]       = useState([]);
  const [auditLog,    setAuditLog]    = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [config,      setConfig]      = useState({ businessTypes: [], divisions: [], years: [] });

  // Loading flags
  const [loadingUsers,       setLoadingUsers]       = useState(true);
  const [loadingAudit,       setLoadingAudit]       = useState(false);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [savingUser,         setSavingUser]         = useState(false);
  const [savingConfig,       setSavingConfig]       = useState(false);

  // User management
  const [searchTerm,        setSearchTerm]        = useState("");
  const [showUserModal,     setShowUserModal]     = useState(false);
  const [editingUser,       setEditingUser]       = useState(null);
  const [modalForm,         setModalForm]         = useState(emptyUser());
  const [modalError,        setModalError]        = useState("");
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [userToRemove,      setUserToRemove]      = useState(null);

  // Roles tab
  const [selectedRole, setSelectedRole] = useState("editor");

  // Audit filters
  const [auditFilterAction, setAuditFilterAction] = useState("all");
  const [auditFilterUser,   setAuditFilterUser]   = useState("all");

  // Submissions filters
  const [subFilterBT,   setSubFilterBT]   = useState("all");
  const [subFilterDiv,  setSubFilterDiv]  = useState("all");
  const [subFilterYear, setSubFilterYear] = useState("all");

  // Config edit state
  const [configEdit,    setConfigEdit]    = useState({ businessTypes: [], divisions: [], years: [] });
  const [configSaveMsg, setConfigSaveMsg] = useState("");
  const [newBT,         setNewBT]         = useState("");
  const [newDiv,        setNewDiv]        = useState("");
  const [newYear,       setNewYear]       = useState("");

  // Animation
  const [fadeIn, setFadeIn] = useState(false);

  /***************************************************************************************
    EFFECTS
  ***************************************************************************************/

  useEffect(() => {
    const t = setTimeout(() => setFadeIn(true), 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => { loadUsers(); }, []);

  useEffect(() => {
    getConfig().then((c) => {
      setConfig(c);
      setConfigEdit({ businessTypes: [...c.businessTypes], divisions: [...c.divisions], years: [...c.years] });
    });
  }, []);

  useEffect(() => {
    if (activeTab === "audit"       && auditLog.length    === 0) loadAuditLog();
    if (activeTab === "submissions" && submissions.length === 0) loadSubmissions();
  }, [activeTab]);

  useEffect(() => {
    document.body.style.overflow = (showUserModal || showRemoveConfirm) ? "hidden" : "auto";
    return () => { document.body.style.overflow = "auto"; };
  }, [showUserModal, showRemoveConfirm]);

  /***************************************************************************************
    DATA LOADERS
  ***************************************************************************************/

  const loadUsers = async () => {
    setLoadingUsers(true);
    setUsers(await getUsers());
    setLoadingUsers(false);
  };

  const loadAuditLog = async () => {
    setLoadingAudit(true);
    setAuditLog(await getAuditLog());
    setLoadingAudit(false);
  };

  const loadSubmissions = async () => {
    setLoadingSubmissions(true);
    setSubmissions(await getSubmissionsIndex());
    setLoadingSubmissions(false);
  };

  /***************************************************************************************
    USER ACTIONS
  ***************************************************************************************/

  const openAddModal  = () => { setEditingUser(null); setModalForm(emptyUser()); setModalError(""); setShowUserModal(true); };
  const openEditModal = (u) => { setEditingUser(u); setModalForm({ ...u }); setModalError(""); setShowUserModal(true); };

  const handleModalField = (field, value) =>
    setModalForm((prev) => ({ ...prev, [field]: value }));

  const toggleDivision = (div) =>
    setModalForm((prev) => ({
      ...prev,
      divisions: prev.divisions.includes(div)
        ? prev.divisions.filter((d) => d !== div)
        : [...prev.divisions, div]
    }));

  const togglePermission = (key) =>
    setModalForm((prev) => ({
      ...prev,
      permissions: { ...prev.permissions, [key]: !prev.permissions[key] }
    }));

  const validateModal = () => {
    if (!modalForm.firstName.trim()) return "First name is required.";
    if (!modalForm.lastName.trim())  return "Last name is required.";
    if (!modalForm.email.trim())     return "Email is required.";
    if (!/\S+@\S+\.\S+/.test(modalForm.email)) return "Enter a valid email.";
    if (modalForm.divisions.length === 0) return "Select at least one division.";
    if (!editingUser) {
      const exists = users.find((u) => u.email.toLowerCase() === modalForm.email.toLowerCase());
      if (exists) return "A user with this email already exists.";
    }
    return "";
  };

  const saveUser = async () => {
    const error = validateModal();
    if (error) { setModalError(error); return; }
    setSavingUser(true);

    let updatedUsers, auditAction, auditDetails;

    if (editingUser) {
      updatedUsers = users.map((u) => u.id === editingUser.id ? { ...modalForm, id: editingUser.id } : u);
      auditAction  = "user_edited";
      auditDetails = `Edited user: ${modalForm.email} (Role: ${modalForm.role})`;
    } else {
      const newUser = { ...modalForm, id: crypto.randomUUID(), createdAt: new Date().toISOString(), lastActive: null };
      updatedUsers  = [...users, newUser];
      auditAction   = "user_added";
      auditDetails  = `Added ${modalForm.email} as ${modalForm.role}`;
    }

    const success = await saveUsers(updatedUsers);
    if (success) {
      setUsers(updatedUsers);
      setShowUserModal(false);
      await appendAuditLog({
        action: auditAction, performedBy: user?.userDetails || "admin",
        details: auditDetails, division: modalForm.divisions.join(", ") || "—"
      });
      if (activeTab === "audit") loadAuditLog();
    } else {
      setModalError("Failed to save. Please try again.");
    }
    setSavingUser(false);
  };

  const confirmRemove = (u) => { setUserToRemove(u); setShowRemoveConfirm(true); };

  const removeUser = async () => {
    if (!userToRemove) return;
    const updatedUsers = users.filter((u) => u.id !== userToRemove.id);
    const success = await saveUsers(updatedUsers);
    if (success) {
      setUsers(updatedUsers);
      await appendAuditLog({
        action: "user_removed", performedBy: user?.userDetails || "admin",
        details: `Removed user: ${userToRemove.email}`, division: "—"
      });
      if (activeTab === "audit") loadAuditLog();
    }
    setShowRemoveConfirm(false);
    setUserToRemove(null);
  };

  /***************************************************************************************
    CONFIG ACTIONS
  ***************************************************************************************/

  const addConfigItem = (key, value, setter) => {
    const trimmed = value.trim();
    if (!trimmed || configEdit[key].includes(trimmed)) return;
    setConfigEdit((prev) => ({ ...prev, [key]: [...prev[key], trimmed] }));
    setter("");
  };

  const removeConfigItem = (key, value) =>
    setConfigEdit((prev) => ({ ...prev, [key]: prev[key].filter((v) => v !== value) }));

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    setConfigSaveMsg("");
    const success = await saveConfig(configEdit);
    if (success) {
      setConfig({ ...configEdit });
      setConfigSaveMsg("Configuration saved successfully.");
      await appendAuditLog({
        action: "config_saved", performedBy: user?.userDetails || "admin",
        details: `Updated config: ${configEdit.businessTypes.length} business types, ${configEdit.divisions.length} divisions, ${configEdit.years.length} years`,
        division: "—"
      });
      if (activeTab === "audit") loadAuditLog();
    } else {
      setConfigSaveMsg("Failed to save configuration. Please try again.");
    }
    setSavingConfig(false);
    setTimeout(() => setConfigSaveMsg(""), 4000);
  };

  /***************************************************************************************
    DERIVED DATA
  ***************************************************************************************/

  const filteredUsers = users.filter((u) => {
    const term = searchTerm.toLowerCase();
    return !term ||
      u.email.toLowerCase().includes(term) ||
      `${u.firstName} ${u.lastName}`.toLowerCase().includes(term) ||
      u.role.toLowerCase().includes(term);
  });

  const filteredAudit = auditLog.filter((e) => {
    const matchAction = auditFilterAction === "all" || e.action      === auditFilterAction;
    const matchUser   = auditFilterUser   === "all" || e.performedBy === auditFilterUser;
    return matchAction && matchUser;
  });

  const filteredSubmissions = submissions.filter((s) => {
    const matchBT   = subFilterBT   === "all" || s.businessType === subFilterBT;
    const matchDiv  = subFilterDiv  === "all" || s.division     === subFilterDiv;
    const matchYear = subFilterYear === "all" || s.year         === subFilterYear;
    return matchBT && matchDiv && matchYear;
  });

  const auditUsers = [...new Set(auditLog.map((e) => e.performedBy).filter(Boolean))];

  /***************************************************************************************
    TAB 1 — USER MANAGEMENT
  ***************************************************************************************/

  const renderUsersTab = () => (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", border: "1.5px solid var(--search-border)", borderRadius: "8px", padding: "8px 14px", gap: "8px", flex: 1, maxWidth: "320px", background: "var(--search-bg)" }}>
          <span style={{ color: "var(--text-muted)" }}>&#128269;</span>
          <input
            style={{ flex: 1, border: "none", outline: "none", fontSize: "13px", color: "var(--text-primary)", background: "transparent", fontFamily: "inherit" }}
            placeholder="Search by name, email or role..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button style={{ ...S.btnOutline, fontSize: "12px", padding: "7px 16px" }}>Export</button>
          <button style={{ ...S.btnPrimary, fontSize: "12px", padding: "7px 16px" }} onClick={openAddModal}>+ Add User</button>
        </div>
      </div>

      {/* Table */}
      {loadingUsers ? (
        <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>Loading users...</div>
      ) : (
        <div style={{ borderRadius: "8px", overflow: "hidden", border: "1px solid var(--border-secondary)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "17%" }} />
              <col style={{ width: "19%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: "9%"  }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "16%" }} />
            </colgroup>
            <thead>
              <tr>
                {["User","Email","Role","Divisions","Status","Last Active","Actions"].map((h) => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ ...S.td, textAlign: "center", padding: "40px", color: "var(--text-placeholder)" }}>
                    {searchTerm ? "No users match your search." : "No users yet. Click + Add User to get started."}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <tr
                    key={u.id}
                    style={{ background: "var(--bg-card-solid)" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-hover)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "var(--bg-card-solid)"}
                  >
                    <td style={S.td}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "var(--border-primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: "700", color: "var(--text-secondary)", flexShrink: 0 }}>
                          {getInitials(u)}
                        </div>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {u.firstName} {u.lastName}
                        </span>
                      </div>
                    </td>
                    <td style={S.td}>{u.email}</td>
                    <td style={S.td}><RoleBadge role={u.role} /></td>
                    <td style={S.td}>{u.divisions?.join(", ") || "—"}</td>
                    <td style={S.td}><StatusBadge status={u.status} /></td>
                    <td style={{ ...S.td, fontSize: "11px", color: "var(--text-muted)" }}>
                      {u.lastActive ? formatTimestamp(u.lastActive) : "Never"}
                    </td>
                    {/* tdActions — no overflow:hidden — fixes Remove button being cut off */}
                    <td style={S.tdActions}>
                      <div style={{ display: "flex", gap: "5px" }}>
                        <button style={S.btnEdit}   onClick={() => openEditModal(u)}>Edit</button>
                        <button style={S.btnDanger} onClick={() => confirmRemove(u)}>Remove</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loadingUsers && filteredUsers.length > 0 && (
        <div style={{ marginTop: "14px", fontSize: "12px", color: "var(--text-muted)" }}>
          Showing {filteredUsers.length} of {users.length} user{users.length !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );

  /***************************************************************************************
    TAB 2 — ROLES AND PERMISSIONS
  ***************************************************************************************/

  const renderRolesTab = () => {
    const perms       = ROLE_PERMISSIONS[selectedRole];
    const permKeys    = Object.keys(perms);
    const formAccess  = permKeys.slice(0, 6);
    const adminAccess = permKeys.slice(6);

    return (
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: "24px" }}>
        {/* Role sidebar */}
        <div style={{ border: "1.5px solid var(--border-secondary)", borderRadius: "10px", overflow: "hidden" }}>
          <div style={{ background: "var(--bg-table-header)", color: "var(--text-table-header)", padding: "12px 16px", fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Roles
          </div>
          {ALL_ROLES.map((role) => (
            <div
              key={role.id}
              onClick={() => setSelectedRole(role.id)}
              style={{ padding: "13px 16px", borderBottom: "1px solid var(--border-divider)", cursor: "pointer", fontSize: "13px", fontWeight: selectedRole === role.id ? "600" : "400", color: selectedRole === role.id ? "var(--text-primary)" : "var(--text-secondary)", background: selectedRole === role.id ? "var(--bg-secondary)" : "var(--bg-card-solid)", display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
              <span>{role.label}</span>
              <span style={{ background: selectedRole === role.id ? "var(--btn-primary-bg)" : "var(--border-primary)", color: selectedRole === role.id ? "var(--btn-primary-text)" : "var(--text-muted)", borderRadius: "10px", padding: "1px 8px", fontSize: "11px", fontWeight: "600" }}>
                {users.filter((u) => u.role === role.id).length}
              </span>
            </div>
          ))}
        </div>

        {/* Permissions panel */}
        <div>
          <div style={{ marginBottom: "18px" }}>
            <div style={{ fontSize: "18px", fontWeight: "700", color: "var(--text-heading)" }}>
              {ALL_ROLES.find((r) => r.id === selectedRole)?.label} Role
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "3px" }}>
              {ALL_ROLES.find((r) => r.id === selectedRole)?.description}
            </div>
          </div>

          {[{ title: "Form Access", keys: formAccess }, { title: "Admin Access", keys: adminAccess }].map(({ title, keys }) => (
            <div key={title} style={{ marginBottom: "20px" }}>
              <div style={S.sectionTitle}>{title}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                {keys.map((key) => (
                  <div
                    key={key}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 13px", borderRadius: "8px", border: `1.5px solid ${perms[key] ? "var(--perm-granted-border)" : "var(--perm-denied-border)"}`, background: perms[key] ? "var(--perm-granted-bg)" : "var(--perm-denied-bg)", opacity: perms[key] ? 1 : 0.65 }}
                  >
                    <span style={{ fontSize: "12px", color: "var(--text-primary)", fontWeight: "500" }}>{key}</span>
                    <span style={{ color: perms[key] ? "var(--perm-granted-check)" : "var(--perm-denied-check)", fontWeight: "700", fontSize: "14px" }}>
                      {perms[key] ? "✓" : "✗"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div>
            <div style={S.sectionTitle}>Division Access — assigned individually per user</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {config.divisions.map((div) => (
                <div key={div} style={{ padding: "5px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: "600", background: "var(--btn-primary-bg)", color: "var(--btn-primary-text)" }}>
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
    TAB 3 — SUBMISSIONS
  ***************************************************************************************/

  const renderSubmissionsTab = () => {
    const todaySubmissions = submissions.filter((s) => {
      const d = new Date(s.submittedAt);
      return !isNaN(d) && d.toDateString() === new Date().toDateString();
    }).length;

    return (
    <div>
      {/* Filters */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap", alignItems: "center" }}>
        {[
          { label: "Business Type", value: subFilterBT,   setter: setSubFilterBT,   options: config.businessTypes },
          { label: "Division",      value: subFilterDiv,  setter: setSubFilterDiv,  options: config.divisions     },
          { label: "Year",          value: subFilterYear, setter: setSubFilterYear, options: config.years         }
        ].map(({ label, value, setter, options }) => (
          <select
            key={label}
            style={{ ...S.select, width: "auto", padding: "7px 12px" }}
            value={value}
            onChange={(e) => setter(e.target.value)}
          >
            <option value="all">All {label}s</option>
            {options.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        ))}
        <div style={{ flex: 1 }} />
        <button style={{ ...S.btnOutline, fontSize: "12px", padding: "7px 16px" }} onClick={loadSubmissions}>
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px", marginBottom: "20px" }}>
        {[
          { num: submissions.length,                                                                   label: "Total Submissions" },
          { num: [...new Set(submissions.map((s) => s.userEmail).filter(Boolean))].length,            label: "Unique Users"      },
          { num: [...new Set(submissions.map((s) => s.division).filter((d) => d !== "—"))].length,    label: "Divisions Active"  },
          { num: todaySubmissions, label: "Submitted Today" }
        ].map((s) => (
          <div key={s.label} style={{ background: "var(--stat-card-bg)", border: "1.5px solid var(--stat-card-border)", borderRadius: "8px", padding: "14px 16px" }}>
            <div style={{ fontSize: "22px", fontWeight: "800", color: "var(--stat-num-color)" }}>{s.num}</div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      {loadingSubmissions ? (
        <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>Loading submissions...</div>
      ) : (
        <div style={{ borderRadius: "8px", overflow: "hidden", border: "1px solid var(--border-secondary)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "22%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "8%"  }} />
              <col style={{ width: "7%"  }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
            </colgroup>
            <thead>
              <tr>
                {["Submission ID","User","Business Type","Division","Year","Submitted At","Fields Changed",""].map((h) => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredSubmissions.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ ...S.td, textAlign: "center", padding: "40px", color: "var(--text-placeholder)" }}>
                    No submissions found.
                  </td>
                </tr>
              ) : (
                filteredSubmissions.map((s, i) => (
                  <tr
                    key={i}
                    style={{ background: "var(--bg-card-solid)" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-hover)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "var(--bg-card-solid)"}
                  >
                    <td style={{ ...S.td, fontFamily: "monospace", fontSize: "10px", color: "var(--text-muted)" }}>
                      {s.submissionId ? s.submissionId.substring(0, 24) + "..." : "—"}
                    </td>
                    <td style={S.td}>{s.userEmail    || "—"}</td>
                    <td style={S.td}>{s.businessType || "—"}</td>
                    <td style={S.td}>{s.division     || "—"}</td>
                    <td style={S.td}>{s.year         || "—"}</td>
                    <td style={{ ...S.td, fontSize: "11px", color: "var(--text-muted)" }}>
                      {formatTimestamp(s.submittedAt)}
                    </td>
                    <td style={{ ...S.td, textAlign: "center" }}>
                      {s.changedFieldsCount != null ? (
                        <span style={{ background: "var(--badge-active-bg)", color: "var(--badge-active-text)", padding: "2px 8px", borderRadius: "20px", fontSize: "10.5px", fontWeight: "600" }}>
                          {s.changedFieldsCount}
                        </span>
                      ) : "—"}
                    </td>
                    <td style={S.tdActions}>
                      <a
                        href={`${import.meta.env.VITE_STORAGE_URL}/${s.blobPath}${import.meta.env.VITE_BLOB_SAS}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: "11px", color: "var(--tab-active-color)", fontWeight: "600", textDecoration: "none" }}
                      >
                        View
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loadingSubmissions && filteredSubmissions.length > 0 && (
        <div style={{ marginTop: "14px", fontSize: "12px", color: "var(--text-muted)" }}>
          Showing {filteredSubmissions.length} of {submissions.length} submission{submissions.length !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
};

  /***************************************************************************************
    TAB 4 — CONFIGURATION
  ***************************************************************************************/

  const renderConfigTab = () => {
    const sections = [
      { key: "businessTypes", label: "Business Types", newVal: newBT,   setter: setNewBT,   placeholder: "e.g. Wholesale" },
      { key: "divisions",     label: "Divisions",      newVal: newDiv,  setter: setNewDiv,  placeholder: "e.g. EMEA"      },
      { key: "years",         label: "Years",          newVal: newYear, setter: setNewYear, placeholder: "e.g. 2028"      }
    ];

    return (
      <div>
        <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "24px" }}>
          Manage the dropdown options that appear in the Business Input form. Changes apply immediately after saving.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "24px", marginBottom: "28px" }}>
          {sections.map(({ key, label, newVal, setter, placeholder }) => (
            <div key={key} style={{ background: "var(--bg-secondary)", borderRadius: "10px", padding: "20px", border: "1.5px solid var(--border-secondary)" }}>
              <div style={S.sectionTitle}>{label}</div>

              <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "14px", minHeight: "60px" }}>
                {configEdit[key].length === 0 ? (
                  <span style={{ fontSize: "12px", color: "var(--text-placeholder)" }}>No items yet</span>
                ) : (
                  configEdit[key].map((item) => (
                    <div key={item} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", background: "var(--bg-card-solid)", borderRadius: "6px", border: "1px solid var(--border-secondary)" }}>
                      <span style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-primary)" }}>{item}</span>
                      <button
                        onClick={() => removeConfigItem(key, item)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--btn-danger-text)", fontSize: "14px", lineHeight: 1, padding: "0 2px" }}
                      >
                        x
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div style={{ display: "flex", gap: "6px" }}>
                <input
                  style={{ ...S.input, flex: 1, padding: "7px 10px", fontSize: "12px" }}
                  placeholder={placeholder}
                  value={newVal}
                  onChange={(e) => setter(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addConfigItem(key, newVal, setter); }}
                />
                <button
                  style={{ ...S.btnPrimary, padding: "7px 12px", fontSize: "12px" }}
                  onClick={() => addConfigItem(key, newVal, setter)}
                >
                  + Add
                </button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <button
            style={{ ...S.btnPrimary, padding: "11px 28px" }}
            onClick={handleSaveConfig}
            disabled={savingConfig}
          >
            {savingConfig ? "Saving..." : "Save Configuration"}
          </button>
          {configSaveMsg && (
            <span style={{ fontSize: "13px", color: configSaveMsg.includes("Failed") ? "var(--error-text)" : "var(--success-text)", fontWeight: "600" }}>
              {configSaveMsg}
            </span>
          )}
        </div>

        <div style={{ marginTop: "20px", padding: "14px 16px", background: "var(--prefilled-bg)", border: "1px solid var(--prefilled-border)", borderRadius: "8px", fontSize: "12px", color: "var(--text-secondary)" }}>
          Removing a Business Type, Division, or Year will not affect existing submissions — it only removes the option from the dropdown for new submissions.
        </div>
      </div>
    );
  };

  /***************************************************************************************
    TAB 5 — AUDIT LOG
  ***************************************************************************************/

  const renderAuditTab = () => {
    const todayCount  = auditLog.filter((e) => new Date(e.timestamp).toDateString() === new Date().toDateString()).length;
    const userChanges = auditLog.filter((e) => ["user_added","user_removed","user_edited"].includes(e.action)).length;

    return (
      <div>
        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px", marginBottom: "22px" }}>
          {[
            { num: todayCount,                                                        label: "Actions Today"     },
            { num: users.filter((u) => u.status === "active").length,                label: "Active Users"      },
            { num: userChanges,                                                       label: "User Changes"      },
            { num: auditLog.filter((e) => e.action === "submit").length,             label: "Total Submissions" }
          ].map((s) => (
            <div key={s.label} style={{ background: "var(--stat-card-bg)", border: "1.5px solid var(--stat-card-border)", borderRadius: "8px", padding: "14px 16px" }}>
              <div style={{ fontSize: "22px", fontWeight: "800", color: "var(--stat-num-color)" }}>{s.num}</div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap", alignItems: "center" }}>
          <select
            style={{ ...S.select, width: "auto", padding: "7px 12px" }}
            value={auditFilterAction}
            onChange={(e) => setAuditFilterAction(e.target.value)}
          >
            <option value="all">All Actions</option>
            {Object.entries(ACTION_BADGE).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <select
            style={{ ...S.select, width: "auto", padding: "7px 12px" }}
            value={auditFilterUser}
            onChange={(e) => setAuditFilterUser(e.target.value)}
          >
            <option value="all">All Users</option>
            {auditUsers.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
          <div style={{ flex: 1 }} />
          <button style={{ ...S.btnOutline, fontSize: "12px", padding: "7px 16px" }} onClick={loadAuditLog}>
            Refresh
          </button>
        </div>

        {/* Table */}
        {loadingAudit ? (
          <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>Loading audit log...</div>
        ) : (
          <div style={{ borderRadius: "8px", overflow: "hidden", border: "1px solid var(--border-secondary)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "18%" }} />
                <col style={{ width: "20%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "39%" }} />
                <col style={{ width: "10%" }} />
              </colgroup>
              <thead>
                <tr>
                  {["Timestamp","User","Action","Details","Division"].map((h) => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredAudit.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ ...S.td, textAlign: "center", padding: "40px", color: "var(--text-placeholder)" }}>
                      No audit entries found.
                    </td>
                  </tr>
                ) : (
                  filteredAudit.map((entry) => (
                    <tr
                      key={entry.id}
                      style={{ background: "var(--bg-card-solid)" }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-hover)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "var(--bg-card-solid)"}
                    >
                      <td style={{ ...S.td, fontFamily: "monospace", fontSize: "11px", color: "var(--text-muted)" }}>
                        {formatTimestamp(entry.timestamp)}
                      </td>
                      <td style={S.td}>{entry.performedBy || "—"}</td>
                      <td style={S.td}>{entry.action && <ActionBadge action={entry.action} />}</td>
                      <td style={S.td}>{entry.details  || "—"}</td>
                      <td style={S.td}>{entry.division || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {!loadingAudit && filteredAudit.length > 0 && (
          <div style={{ marginTop: "14px", fontSize: "12px", color: "var(--text-muted)" }}>
            Showing {filteredAudit.length} of {auditLog.length} entries
          </div>
        )}
      </div>
    );
  };

  /***************************************************************************************
    ADD / EDIT USER MODAL
  ***************************************************************************************/

  const renderUserModal = () => (
    <div style={{ position: "fixed", inset: 0, background: "var(--modal-overlay-bg)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 9999, backdropFilter: "blur(4px)" }}>
      <div style={{ background: "var(--bg-modal)", borderRadius: "14px", width: "560px", maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", boxShadow: "var(--shadow-modal)", fontFamily: "inherit" }}>

        {/* Header */}
        <div style={{ background: "var(--bg-table-header)", color: "var(--text-table-header)", padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderRadius: "14px 14px 0 0" }}>
          <span style={{ fontSize: "15px", fontWeight: "700" }}>
            {editingUser ? "Edit User" : "Add New User"}
          </span>
          <button onClick={() => setShowUserModal(false)} style={{ background: "none", border: "none", color: "var(--text-table-header)", fontSize: "18px", cursor: "pointer", opacity: 0.7 }}>
            x
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "24px" }}>
          {modalError && (
            <div style={{ background: "var(--error-bg)", border: "1px solid var(--error-border)", color: "var(--error-text)", padding: "10px 14px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px" }}>
              {modalError}
            </div>
          )}

          {/* Name row */}
          <div style={{ display: "flex", gap: "14px", marginBottom: "16px" }}>
            <div style={{ flex: 1 }}>
              <label style={S.label}>First Name</label>
              <input style={S.input} value={modalForm.firstName} onChange={(e) => handleModalField("firstName", e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Last Name</label>
              <input style={S.input} value={modalForm.lastName} onChange={(e) => handleModalField("lastName", e.target.value)} />
            </div>
          </div>

          {/* Email */}
          <div style={{ marginBottom: "16px" }}>
            <label style={S.label}>Email Address</label>
            <input
              style={{ ...S.input, opacity: editingUser ? 0.6 : 1 }}
              type="email"
              value={modalForm.email}
              onChange={(e) => handleModalField("email", e.target.value)}
              disabled={!!editingUser}
            />
          </div>

          {/* Login method + Role */}
          <div style={{ display: "flex", gap: "14px", marginBottom: "16px" }}>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Login Method</label>
              <select style={S.select} value={modalForm.loginMethod} onChange={(e) => handleModalField("loginMethod", e.target.value)}>
                <option value="microsoft">Microsoft SSO</option>
                <option value="guest">Guest Access</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Role</label>
              <select style={S.select} value={modalForm.role} onChange={(e) => handleModalField("role", e.target.value)}>
                <option value="viewer">Viewer - Read only</option>
                <option value="editor">Editor - Can submit</option>
                <option value="admin">Admin - Full access</option>
              </select>
            </div>
          </div>

          {/* Status — edit only */}
          {editingUser && (
            <div style={{ marginBottom: "16px" }}>
              <label style={S.label}>Status</label>
              <select style={S.select} value={modalForm.status} onChange={(e) => handleModalField("status", e.target.value)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          )}

          <div style={{ height: "1px", background: "var(--border-divider)", margin: "18px 0" }} />

          {/* Divisions + Permissions */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <div>
              <div style={S.sectionTitle}>Division Access</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "7px" }}>
                {config.divisions.map((div) => {
                  const selected = modalForm.divisions.includes(div);
                  return (
                    <div
                      key={div}
                      onClick={() => toggleDivision(div)}
                      style={{ padding: "5px 13px", borderRadius: "6px", fontSize: "12px", fontWeight: "600", cursor: "pointer", border: "1.5px solid", borderColor: selected ? "var(--btn-primary-bg)" : "var(--border-primary)", background: selected ? "var(--btn-primary-bg)" : "transparent", color: selected ? "var(--btn-primary-text)" : "var(--text-secondary)", transition: "all 0.15s" }}
                    >
                      {div}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <div style={S.sectionTitle}>Form Permissions</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "7px" }}>
                {[
                  { key: "businessInput", label: "Business Input" },
                  { key: "forecastEdit",  label: "Forecast Edit"  },
                  { key: "planEdit",      label: "Plan Edit"      },
                  { key: "adminReports",  label: "Admin Reports"  }
                ].map(({ key, label }) => {
                  const on = modalForm.permissions?.[key];
                  return (
                    <div
                      key={key}
                      onClick={() => togglePermission(key)}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 11px", borderRadius: "8px", border: `1.5px solid ${on ? "var(--btn-primary-bg)" : "var(--border-secondary)"}`, background: on ? "var(--bg-secondary)" : "var(--bg-card-solid)", cursor: "pointer" }}
                    >
                      <span style={{ fontSize: "12px", color: "var(--text-primary)" }}>{label}</span>
                      <div style={{ width: "32px", height: "18px", borderRadius: "9px", background: on ? "var(--toggle-on-bg)" : "var(--toggle-off-bg)", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                        <div style={{ position: "absolute", top: "3px", left: on ? "16px" : "3px", width: "12px", height: "12px", borderRadius: "50%", background: "white", transition: "left 0.2s" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 24px", background: "var(--bg-modal-footer)", borderTop: "1px solid var(--border-divider)", display: "flex", justifyContent: "flex-end", gap: "10px", borderRadius: "0 0 14px 14px" }}>
          <button style={S.btnOutline} onClick={() => setShowUserModal(false)}>Cancel</button>
          <button style={S.btnPrimary} onClick={saveUser} disabled={savingUser}>
            {savingUser ? "Saving..." : editingUser ? "Save Changes" : "Create User"}
          </button>
        </div>
      </div>
    </div>
  );

  /***************************************************************************************
    REMOVE CONFIRM MODAL
  ***************************************************************************************/

  const renderRemoveConfirm = () => (
    <div style={{ position: "fixed", inset: 0, background: "var(--modal-overlay-bg)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 9999, backdropFilter: "blur(4px)" }}>
      <div style={{ background: "var(--bg-modal)", borderRadius: "14px", width: "380px", padding: "32px 28px", textAlign: "center", boxShadow: "var(--shadow-modal)" }}>
        <div style={{ fontSize: "28px", marginBottom: "12px" }}>!</div>
        <h3 style={{ marginBottom: "10px", fontFamily: "inherit", color: "var(--text-heading)" }}>Remove User</h3>
        <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "8px" }}>Are you sure you want to remove:</p>
        <p style={{ fontSize: "14px", fontWeight: "700", marginBottom: "24px", color: "var(--text-primary)" }}>
          {userToRemove?.firstName} {userToRemove?.lastName}
          <br />
          <span style={{ fontWeight: "400", color: "var(--text-muted)", fontSize: "12px" }}>{userToRemove?.email}</span>
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: "12px" }}>
          <button style={S.btnOutline} onClick={() => setShowRemoveConfirm(false)}>Cancel</button>
          <button style={{ ...S.btnPrimary, background: "#dc2626" }} onClick={removeUser}>Remove</button>
        </div>
      </div>
    </div>
  );

  /***************************************************************************************
    MAIN RENDER
  ***************************************************************************************/

  return (
    <div style={{
      minHeight: "100vh", width: "100vw",
      display: "flex", justifyContent: "center",
      backgroundImage: "url('/background.jpg')",
      backgroundSize: "cover", backgroundRepeat: "no-repeat", backgroundPosition: "center",
      fontFamily: "'Montserrat', sans-serif",
      padding: "40px 20px", boxSizing: "border-box",
      opacity: fadeIn ? 1 : 0,
      transition: "opacity 0.4s ease, transform 0.4s ease",
      transform: fadeIn ? "translateY(0px)" : "translateY(10px)"
    }}>
      <div style={{
        background: "var(--bg-card)",
        backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
        padding: "40px", borderRadius: "20px",
        width: "100%", maxWidth: "1060px",
        boxShadow: "var(--shadow-card)", position: "relative",
        alignSelf: "flex-start"
      }}>

        {/* User badge */}
        <div style={{ position: "absolute", top: "20px", right: "28px", fontSize: "12px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "6px" }}>
          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--text-primary)" }} />
          {user?.userDetails || "Admin User"}
        </div>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "8px" }}>
          <img src="/stevemadden-logo.png" alt="Steve Madden" style={{ height: "60px" }} />
        </div>

        <h1 style={{ fontSize: "26px", fontWeight: "700", color: "var(--text-heading)", marginBottom: "6px" }}>
          Admin Console
        </h1>
        <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "28px" }}>
          Manage users, roles, submissions and platform configuration
        </p>

        {/* Tab bar */}
        <div style={{ display: "flex", borderBottom: "2px solid var(--border-primary)", marginBottom: "28px", flexWrap: "wrap" }}>
          {[
            { id: "users",       label: "User Management"    },
            { id: "roles",       label: "Roles & Permissions" },
            { id: "submissions", label: "Submissions"         },
            { id: "config",      label: "Configuration"       },
            { id: "audit",       label: "Audit Log"           }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "10px 18px", fontSize: "13px", fontWeight: "600",
                color: activeTab === tab.id ? "var(--tab-active-color)" : "var(--tab-inactive-color)",
                cursor: "pointer", border: "none", background: "none",
                borderBottom: activeTab === tab.id ? "3px solid var(--tab-active-border)" : "3px solid transparent",
                marginBottom: "-2px", fontFamily: "inherit", transition: "all 0.2s"
              }}
            >
              {tab.label}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button
            onClick={onLogout}
            style={{ ...S.btnOutline, fontSize: "12px", padding: "6px 16px", alignSelf: "center", marginBottom: "4px" }}
          >
            Logout
          </button>
        </div>

        {/* Tab content */}
        {activeTab === "users"       && renderUsersTab()}
        {activeTab === "roles"       && renderRolesTab()}
        {activeTab === "submissions" && renderSubmissionsTab()}
        {activeTab === "config"      && renderConfigTab()}
        {activeTab === "audit"       && renderAuditTab()}
      </div>

      {showUserModal     && renderUserModal()}
      {showRemoveConfirm && renderRemoveConfirm()}
    </div>
  );
}