// Inicio filters live for the whole visit, so coming back from a ticket keeps the same view.
import { OPEN_STATUSES } from './format.js';

export const listFilters = $state({ q: '', mine: null, statuses: [...OPEN_STATUSES] });
