// Converts between the app's data and the rows in the online database
// (supabase/schema.sql). The app uses camelCase, the database snake_case.
// Plain JavaScript, so it can be tested with Node.

const num = (v) => (v === null || v === undefined ? null : Number(v));

export function siteToRow(s) {
  return {
    id: s.id,
    name: s.name,
    district: s.district,
    site_type: s.siteType,
    project_scale: s.projectScale,
    distance_to_water_metres: s.distanceToWaterMetres,
    latitude: s.latitude,
    longitude: s.longitude,
    prior_violations: s.priorViolations,
    prior_inspection_date: s.priorInspectionDate,
    archived: s.archived,
    created_at: s.createdAt,
    created_by: s.createdBy,
    updated_at: s.updatedAt,
  };
}

export function rowToSite(r) {
  return {
    id: r.id,
    name: r.name,
    district: r.district,
    siteType: r.site_type,
    projectScale: r.project_scale,
    distanceToWaterMetres: num(r.distance_to_water_metres),
    latitude: num(r.latitude),
    longitude: num(r.longitude),
    priorViolations: r.prior_violations,
    priorInspectionDate: r.prior_inspection_date,
    archived: r.archived,
    createdAt: r.created_at,
    createdBy: r.created_by,
    updatedAt: r.updated_at,
  };
}

/** What is sent to the record_inspection database function. */
export function inspectionToPayload(i) {
  return {
    id: i.id,
    siteId: i.siteId,
    visitDate: i.visitDate,
    outcome: i.outcome,
    notes: i.notes ?? '',
    inspectorName: i.inspectorName,
    recordedAt: i.recordedAt,
    scoreBefore: i.scoreBefore,
    scoreAfter: i.scoreAfter,
    violations: (i.violations ?? []).map((v) => ({ category: v.category, severity: v.severity, description: v.description })),
  };
}

export function rowToInspection(r) {
  return {
    id: r.id,
    siteId: r.site_id,
    visitDate: r.visit_date,
    outcome: r.outcome,
    notes: r.notes ?? '',
    violations: [...(r.violations ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((v) => ({ category: v.category, severity: v.severity, description: v.description })),
    inspectorId: r.inspector_id,
    inspectorName: r.inspector_name,
    recordedAt: r.recorded_at,
    syncedAt: r.synced_at,
    scoreBefore: r.score_before,
    scoreAfter: r.score_after,
  };
}

export function rowToUser(r) {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    assignedDistrict: r.assigned_district,
    active: r.active,
    createdAt: r.created_at,
  };
}

export function userToRow(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    assigned_district: u.assignedDistrict ?? null,
    active: u.active ?? true,
  };
}

export function settingsToRow(s) {
  return {
    id: 1,
    weights: s.weights,
    overdue_threshold_days: s.overdueThresholdDays,
    updated_at: s.updatedAt,
    updated_by: s.updatedBy,
  };
}

export function rowToSettings(r) {
  return {
    weights: r.weights,
    overdueThresholdDays: r.overdue_threshold_days,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
  };
}

export function activityToRow(a) {
  return { at: a.at, user_id: a.userId, user_name: a.userName, action: a.action, detail: a.detail ?? '' };
}

export function rowToActivity(r) {
  return { at: r.at, userId: r.user_id, userName: r.user_name, action: r.action, detail: r.detail };
}

/**
 * Puts changes that have not reached the database yet back on top of
 * freshly downloaded data, so nothing typed offline disappears from the
 * screen while it waits to be sent (NFR 5).
 */
export function applyPending(data, outbox) {
  const out = { ...data, sites: [...data.sites], inspections: [...data.inspections], activity: [...data.activity] };
  for (const op of outbox) {
    if (op.kind === 'site') {
      const i = out.sites.findIndex((s) => s.id === op.row.id);
      if (i === -1) out.sites.push(op.row);
      else out.sites[i] = op.row;
    } else if (op.kind === 'inspection') {
      if (!out.inspections.some((x) => x.id === op.row.id)) out.inspections.push(op.row);
    } else if (op.kind === 'settings') {
      out.settings = op.row;
    } else if (op.kind === 'activity') {
      out.activity.unshift(op.row);
    }
  }
  return out;
}

/** True when an error means "no connection" (try again later) rather than "refused". */
export function isNetworkError(error) {
  if (!error) return false;
  const text = `${error.name ?? ''} ${error.message ?? ''} ${error.details ?? ''}`.toLowerCase();
  return error.status === 0 || /failed to fetch|networkerror|network request failed|load failed|timeout|fetch failed/.test(text);
}
