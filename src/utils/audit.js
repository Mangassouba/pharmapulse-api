import db from '../config/database.js'
import { auditLogs } from '../db/schema.js'
import logger from '../config/logger.js'

/**
 * Create an audit log entry
 */
export async function createAuditLog({ action, entity, entity_id, old_values, new_values, userId, pharmacyId, req }) {
  try {
    await db.insert(auditLogs).values({
      action,
      entity,
      entity_id,
      old_values: old_values ?? null,
      new_values: new_values ?? null,
      ip_address: req?.ip || null,
      user_agent: req?.get('user-agent') || null,
      userId:     userId     ?? null,
      pharmacyId: pharmacyId ?? null,
    })
  } catch (err) {
    logger.error('Audit log failed:', err)
  }
}
