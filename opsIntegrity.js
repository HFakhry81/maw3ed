/**
 * Phase 2 data-integrity helpers for Maw3ed workspace ops.
 * Works on in-memory / JSON store shapes (opsStore) without requiring Postgres.
 * Optional PG checks live in scripts that call these helpers after loading rows.
 */

"use strict";

/** Composite FKs that migration 010 already declares. */
const PRESENT_COMPOSITE_FKS = [
  {
    id: "customers_category",
    child: "workspace_ops_customers",
    columns: ["workspace_id", "category_id"],
    parent: "workspace_ops_customer_categories",
    parentColumns: ["workspace_id", "id"],
    status: "present"
  },
  {
    id: "staff_working_hours_staff",
    child: "workspace_ops_staff_working_hours",
    columns: ["workspace_id", "staff_id"],
    parent: "workspace_ops_staff",
    parentColumns: ["workspace_id", "id"],
    status: "present"
  },
  {
    id: "staff_closed_days_staff",
    child: "workspace_ops_staff_closed_days",
    columns: ["workspace_id", "staff_id"],
    parent: "workspace_ops_staff",
    parentColumns: ["workspace_id", "id"],
    status: "present"
  },
  {
    id: "staff_specific_days_staff",
    child: "workspace_ops_staff_specific_days",
    columns: ["workspace_id", "staff_id"],
    parent: "workspace_ops_staff",
    parentColumns: ["workspace_id", "id"],
    status: "present"
  },
  {
    id: "services_category",
    child: "workspace_ops_services",
    columns: ["workspace_id", "category_id"],
    parent: "workspace_ops_service_categories",
    parentColumns: ["workspace_id", "id"],
    status: "present"
  },
  {
    id: "service_providers_service",
    child: "workspace_ops_service_providers",
    columns: ["workspace_id", "service_id"],
    parent: "workspace_ops_services",
    parentColumns: ["workspace_id", "id"],
    status: "present"
  },
  {
    id: "service_providers_staff",
    child: "workspace_ops_service_providers",
    columns: ["workspace_id", "staff_id"],
    parent: "workspace_ops_staff",
    parentColumns: ["workspace_id", "id"],
    status: "present"
  },
  {
    id: "line_items_appointment",
    child: "workspace_ops_appointment_line_items",
    columns: ["workspace_id", "appointment_id"],
    parent: "workspace_ops_appointments",
    parentColumns: ["workspace_id", "id"],
    status: "present"
  },
  {
    id: "visits_appointment",
    child: "workspace_ops_appointment_visits",
    columns: ["workspace_id", "appointment_id"],
    parent: "workspace_ops_appointments",
    parentColumns: ["workspace_id", "id"],
    status: "present"
  },
  {
    id: "visit_meta_visit",
    child: "workspace_ops_appointment_visit_meta",
    columns: ["workspace_id", "appointment_id", "visit_id"],
    parent: "workspace_ops_appointment_visits",
    parentColumns: ["workspace_id", "appointment_id", "id"],
    status: "present"
  }
];

/**
 * Missing composite FKs that Phase 2 migration 011 is expected to add.
 * Soft / empty-string columns stay documented gaps until product normalizes them.
 */
const REQUIRED_APPOINTMENT_COMPOSITE_FKS = [
  {
    id: "appointments_customer",
    constraint: "workspace_ops_appointments_customer_fk",
    child: "workspace_ops_appointments",
    columns: ["workspace_id", "customer_id"],
    parent: "workspace_ops_customers",
    parentColumns: ["workspace_id", "id"],
    nullable: true,
    status: "required_011"
  },
  {
    id: "appointments_staff",
    constraint: "workspace_ops_appointments_staff_fk",
    child: "workspace_ops_appointments",
    columns: ["workspace_id", "staff_id"],
    parent: "workspace_ops_staff",
    parentColumns: ["workspace_id", "id"],
    nullable: true,
    status: "required_011"
  },
  {
    id: "appointments_service",
    constraint: "workspace_ops_appointments_service_fk",
    child: "workspace_ops_appointments",
    columns: ["workspace_id", "service_id"],
    parent: "workspace_ops_services",
    parentColumns: ["workspace_id", "id"],
    nullable: true,
    status: "required_011"
  },
  {
    id: "appointments_checked_in_by",
    constraint: "workspace_ops_appointments_checked_in_by_fk",
    child: "workspace_ops_appointments",
    columns: ["workspace_id", "checked_in_by_staff_id"],
    parent: "workspace_ops_staff",
    parentColumns: ["workspace_id", "id"],
    nullable: true,
    status: "required_011"
  },
  {
    id: "line_items_service",
    constraint: "workspace_ops_appointment_line_items_service_fk",
    child: "workspace_ops_appointment_line_items",
    columns: ["workspace_id", "service_id"],
    parent: "workspace_ops_services",
    parentColumns: ["workspace_id", "id"],
    nullable: true,
    status: "required_011"
  },
  {
    id: "line_items_added_by",
    constraint: "workspace_ops_appointment_line_items_added_by_fk",
    child: "workspace_ops_appointment_line_items",
    columns: ["workspace_id", "added_by_staff_id"],
    parent: "workspace_ops_staff",
    parentColumns: ["workspace_id", "id"],
    nullable: true,
    status: "required_011"
  },
  {
    id: "visits_staff",
    constraint: "workspace_ops_appointment_visits_staff_fk",
    child: "workspace_ops_appointment_visits",
    columns: ["workspace_id", "staff_id"],
    parent: "workspace_ops_staff",
    parentColumns: ["workspace_id", "id"],
    nullable: true,
    status: "required_011"
  }
];

/** Soft refs kept open: empty-string defaults make strict FK unsafe without cleanup. */
const DOCUMENTED_SOFT_REFS = [
  {
    id: "appointments_category",
    child: "workspace_ops_appointments",
    column: "category_id",
    note: "DEFAULT '' — لا يُضاف FK حتى تُحوَّل القيم الفارغة إلى NULL أو فئة معروفة"
  },
  {
    id: "staff_service_category",
    child: "workspace_ops_staff",
    column: "service_category_id",
    note: "DEFAULT '' — مرجع ناعم؛ غير مقيّد بـ FK في المرحلة 2 الحزمة الأولى"
  }
];

function isBlankId(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

function idSet(rows, key = "id") {
  const set = new Set();
  for (const row of rows || []) {
    if (!row || isBlankId(row[key])) continue;
    set.add(String(row[key]));
  }
  return set;
}

function entityCounts(store) {
  const data = store && typeof store === "object" ? store : {};
  return {
    customerCategories: (data.customerCategories || []).length,
    customers: (data.customers || []).length,
    staff: (data.staff || []).length,
    serviceCategories: (data.serviceCategories || []).length,
    services: (data.services || []).length,
    expenses: (data.expenses || []).length,
    appointments: (data.appointments || []).length,
    closedDays: (data.closedDays || []).length,
    specificDays: (data.specificDays || []).length,
    medicalDepartments: (data.medicalDepartments || []).length,
    workingHours: (data.workingHours || []).length,
    slug: String(data.bookingPage?.slug || "")
  };
}

/**
 * Audit a JSON/opsStore-shaped workspace for orphan references.
 * Returns { ok, orphans: [...], counts }.
 */
function auditStore(store, options = {}) {
  const data = store && typeof store === "object" ? store : {};
  const orphans = [];
  const categoryIds = idSet(data.customerCategories);
  const customerIds = idSet(data.customers);
  const staffIds = idSet(data.staff);
  const serviceCategoryIds = idSet(data.serviceCategories);
  const serviceIds = idSet(data.services);
  const appointmentIds = idSet(data.appointments);

  for (const customer of data.customers || []) {
    const categoryId = customer.categoryId;
    if (!isBlankId(categoryId) && !categoryIds.has(String(categoryId))) {
      orphans.push({
        relation: "customers.categoryId",
        childId: customer.id,
        missingParentId: String(categoryId)
      });
    }
  }

  for (const service of data.services || []) {
    const categoryId = service.categoryId;
    if (!isBlankId(categoryId) && !serviceCategoryIds.has(String(categoryId))) {
      orphans.push({
        relation: "services.categoryId",
        childId: service.id,
        missingParentId: String(categoryId)
      });
    }
    for (const providerId of service.providerIds || []) {
      if (!isBlankId(providerId) && !staffIds.has(String(providerId))) {
        orphans.push({
          relation: "services.providerIds",
          childId: service.id,
          missingParentId: String(providerId)
        });
      }
    }
  }

  for (const appointment of data.appointments || []) {
    const apptId = appointment.id;
    if (!isBlankId(appointment.customerId) && !customerIds.has(String(appointment.customerId))) {
      orphans.push({
        relation: "appointments.customerId",
        childId: apptId,
        missingParentId: String(appointment.customerId)
      });
    }
    if (!isBlankId(appointment.staffId) && !staffIds.has(String(appointment.staffId))) {
      orphans.push({
        relation: "appointments.staffId",
        childId: apptId,
        missingParentId: String(appointment.staffId)
      });
    }
    if (!isBlankId(appointment.serviceId) && !serviceIds.has(String(appointment.serviceId))) {
      orphans.push({
        relation: "appointments.serviceId",
        childId: apptId,
        missingParentId: String(appointment.serviceId)
      });
    }
    if (
      !isBlankId(appointment.checkedInByStaffId) &&
      !staffIds.has(String(appointment.checkedInByStaffId))
    ) {
      orphans.push({
        relation: "appointments.checkedInByStaffId",
        childId: apptId,
        missingParentId: String(appointment.checkedInByStaffId)
      });
    }

    for (const line of appointment.lineItems || []) {
      if (!isBlankId(line.serviceId) && !serviceIds.has(String(line.serviceId))) {
        orphans.push({
          relation: "appointments.lineItems.serviceId",
          childId: `${apptId}/${line.id || "?"}`,
          missingParentId: String(line.serviceId)
        });
      }
      if (!isBlankId(line.addedByStaffId) && !staffIds.has(String(line.addedByStaffId))) {
        orphans.push({
          relation: "appointments.lineItems.addedByStaffId",
          childId: `${apptId}/${line.id || "?"}`,
          missingParentId: String(line.addedByStaffId)
        });
      }
    }

    for (const visit of appointment.visits || []) {
      if (!isBlankId(visit.staffId) && !staffIds.has(String(visit.staffId))) {
        orphans.push({
          relation: "appointments.visits.staffId",
          childId: `${apptId}/${visit.id || "?"}`,
          missingParentId: String(visit.staffId)
        });
      }
    }
  }

  // Optional: treat appointment ids referenced only in nested structures — already nested.
  void appointmentIds;
  void options;

  const maxOrphans = Number(options.maxOrphansReport || 50);
  return {
    ok: orphans.length === 0,
    orphanCount: orphans.length,
    orphans: orphans.slice(0, maxOrphans),
    counts: entityCounts(data),
    truncated: orphans.length > maxOrphans
  };
}

function sortedIds(rows) {
  return [...idSet(rows)].sort();
}

/**
 * Compare two ops store snapshots by entity counts and id sets.
 */
function compareStores(left, right, options = {}) {
  const leftLabel = options.leftLabel || "left";
  const rightLabel = options.rightLabel || "right";
  const leftCounts = entityCounts(left);
  const rightCounts = entityCounts(right);
  const diffs = [];

  for (const key of Object.keys(leftCounts)) {
    if (leftCounts[key] !== rightCounts[key]) {
      diffs.push({
        kind: "count",
        entity: key,
        [leftLabel]: leftCounts[key],
        [rightLabel]: rightCounts[key]
      });
    }
  }

  const collections = [
    ["customers", left?.customers, right?.customers],
    ["staff", left?.staff, right?.staff],
    ["services", left?.services, right?.services],
    ["serviceCategories", left?.serviceCategories, right?.serviceCategories],
    ["customerCategories", left?.customerCategories, right?.customerCategories],
    ["appointments", left?.appointments, right?.appointments],
    ["expenses", left?.expenses, right?.expenses]
  ];

  for (const [name, leftRows, rightRows] of collections) {
    const leftIds = new Set(sortedIds(leftRows));
    const rightIds = new Set(sortedIds(rightRows));
    const onlyLeft = [...leftIds].filter((id) => !rightIds.has(id));
    const onlyRight = [...rightIds].filter((id) => !leftIds.has(id));
    if (onlyLeft.length || onlyRight.length) {
      diffs.push({
        kind: "ids",
        entity: name,
        onlyLeft: onlyLeft.slice(0, 20),
        onlyRight: onlyRight.slice(0, 20),
        onlyLeftCount: onlyLeft.length,
        onlyRightCount: onlyRight.length
      });
    }
  }

  return {
    ok: diffs.length === 0,
    left: { label: leftLabel, counts: leftCounts },
    right: { label: rightLabel, counts: rightCounts },
    diffs
  };
}

/**
 * Scan migration SQL text for expected constraint names / FK fragments.
 */
function auditMigrationSqlInventory(sqlTextByFile) {
  const combined = Object.entries(sqlTextByFile || {})
    .map(([file, text]) => `-- file:${file}\n${text}`)
    .join("\n");

  const missingPresent = [];
  for (const fk of PRESENT_COMPOSITE_FKS) {
    const childHit = combined.includes(fk.child);
    const parentHit = combined.includes(`REFERENCES ${fk.parent}`);
    // Present FKs are in 010; require both table and REFERENCES parent appear.
    if (!childHit || !parentHit) {
      missingPresent.push(fk.id);
    }
  }

  const missingRequired = [];
  for (const fk of REQUIRED_APPOINTMENT_COMPOSITE_FKS) {
    const byConstraint = combined.includes(fk.constraint);
    const byColumns =
      combined.includes(fk.columns.join(", ")) ||
      combined.includes(`(${fk.columns.join(", ")})`);
    if (!byConstraint && !byColumns) {
      missingRequired.push(fk.id);
    }
  }

  return {
    ok: missingPresent.length === 0 && missingRequired.length === 0,
    missingPresent,
    missingRequired,
    softRefs: DOCUMENTED_SOFT_REFS,
    requiredConstraintNames: REQUIRED_APPOINTMENT_COMPOSITE_FKS.map((fk) => fk.constraint)
  };
}

module.exports = {
  PRESENT_COMPOSITE_FKS,
  REQUIRED_APPOINTMENT_COMPOSITE_FKS,
  DOCUMENTED_SOFT_REFS,
  isBlankId,
  entityCounts,
  auditStore,
  compareStores,
  auditMigrationSqlInventory
};
