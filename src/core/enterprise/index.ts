/**
 * Enterprise access control module
 */

export {
  checkServerAccess,
  applyEnterpriseFlags,
  isExclusiveEnterpriseMode,
  isMarketplaceLockdown,
  isLockdownMode,
  type AccessControlResult,
  type AccessControlConfig,
} from './restrictions.js';

export {
  matchServerRestriction,
  matchByName,
  matchByCommand,
  matchByUrl,
  wildcardToRegex,
} from './matching.js';
