/**
 * Apps Script to sync user's calendars many to one 
 * (from many calendar, aggregate to one (e.g. from work calendars update a shared one))
 * 
 * @author Joe Shachaf <joe@joeshachaf.net>
 * @version 1.0.0
 * @license Apache-2.0
 */

/**
 * 
 * @customfunction
 */
function loadActiveSourceConfigs() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.sheetNames.source);

  if (!sheet) {
    throw new Error(`Missing sheet: ${CONFIG.sheetNames.source}`);
  }

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return [];
  }

  const headers = values[0].map(h => String(h).trim());
  const rows = values.slice(1);

  const col = buildColumnIndex_(headers);

  requireColumns_(col, [
    'Enabled',
    'Source Calendar ID',
    'Source Calendar Name',
    'Target Calendar ID',
    'Policy',
    'Target Title',
    'Skip Keywords'
  ]);

  return rows
    .map((row, index) => parseSourceConfigRow_(row, col, index + 2))
    .filter(config => config.enabled)
    .filter(config => config.policy !== CONFIG.policies.skip);
}

/**
 * 
 * @customfunction
 */
function buildColumnIndex_(headers) {
  const col = {};

  headers.forEach((header, index) => {
    if (header) {
      col[header] = index;
    }
  });

  return col;
}

/**
 * 
 * @customfunction
 */
function requireColumns_(col, requiredColumns) {
  const missing = requiredColumns.filter(name => col[name] === undefined);

  if (missing.length > 0) {
    throw new Error(`Missing required column(s): ${missing.join(', ')}`);
  }
}

/**
 * 
 * @customfunction
 */
function parseSourceConfigRow_(row, col, rowNumber) {
  const enabled = normalizeYesNo_(row[col['Enabled']]);
  const policy = normalizePolicy_(row[col['Policy']]);

  return {
    rowNumber,
    enabled,
    sourceCalendarId: cleanString_(row[col['Source Calendar ID']]),
    sourceCalendarName: cleanString_(row[col['Source Calendar Name']]),
    targetCalendarId: cleanString_(row[col['Target Calendar ID']]),
    policy,
    targetTitle: cleanString_(row[col['Target Title']]),
    skipKeywords: parseKeywordList_(row[col['Skip Keywords']]),
    lookaheadDays: parseLookaheadDays_(row[col['Lookahead Days']])
  };
}

/**
 * 
 * @customfunction
 */
function normalizeYesNo_(value) {
  const normalized = cleanString_(value).toLowerCase();

  return ['yes', 'y', 'true', '1'].includes(normalized);
}

/**
 * 
 * @customfunction
 */
function normalizePolicy_(value) {
  const normalized = cleanString_(value).toLowerCase();

  if (!normalized) {
    throw new Error('Policy is required.');
  }

  if (['full', 'placeholder', 'skip'].includes(normalized)) {
    return normalized;
  }

  throw new Error(`Unsupported policy: ${value}`);
}

/**
 * 
 * @customfunction
 */
function parseKeywordList_(value) {
  const raw = cleanString_(value);

  if (!raw) {
    return [];
  }

  return raw
    .split(',')
    .map(item => cleanString_(item))
    .filter(item => item.length > 0)
    .filter((item, index, array) => array.indexOf(item) === index);
}

/**
 * 
 * @customfunction
 */
function cleanString_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

/**
 * 
 * @customfunction
 */
function getSyncWindow_(lookaheadDays) {
  const days = lookaheadDays || CONFIG.lookaheadDays;

  const now = new Date();

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + days);

  return {
    start,
    end,
    startIso: start.toISOString(),
    endIso: end.toISOString()
  };
}

/**
 * 
 * @customfunction
 */
function listSourceEvents_(calendarId, syncWindow) {
  const events = [];
  let pageToken;

  do {
    const response = Calendar.Events.list(calendarId, {
      timeMin: syncWindow.startIso,
      timeMax: syncWindow.endIso,
      singleEvents: true,
      orderBy: 'startTime',
      showDeleted: false,
      maxResults: 2500,
      pageToken
    });

    if (response.items && response.items.length > 0) {
      events.push(...response.items);
    }

    pageToken = response.nextPageToken;
  } while (pageToken);

  return events;
}

/**
 * 
 * @customfunction
 */
function getEventStartValue_(event) {
  return event.start.dateTime || event.start.date || '';
}

/**
 * 
 * @customfunction
 */
function getEventEndValue_(event) {
  return event.end.dateTime || event.end.date || '';
}

/**
 * 
 * @customfunction
 */
function shouldSkipSourceEvent_(event, config) {
  const title = normalizeForKeywordMatch_(event.summary || '');

  if (!title) {
    return false;
  }

  if (!config.skipKeywords || config.skipKeywords.length === 0) {
    return false;
  }

  return config.skipKeywords.some(keyword => {
    const normalizedKeyword = normalizeForKeywordMatch_(keyword);
    return normalizedKeyword && title.includes(normalizedKeyword);
  });
}

/**
 * 
 * @customfunction
 */
function normalizeForKeywordMatch_(value) {
  return cleanString_(value)
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * 
 * @customfunction
 */
function buildExpectedTargetEvent_(sourceEvent, config) {
  const targetTitle = getTargetTitle_(sourceEvent, config);
  const hash = buildSourceHash_(sourceEvent, config, targetTitle);
  const description = buildTargetDescription_(sourceEvent, config, hash);

  const targetEvent = {
    summary: targetTitle,
    description: description,
    start: sourceEvent.start,
    end: sourceEvent.end
  };

  if (config.policy === CONFIG.policies.full && sourceEvent.location) {
    targetEvent.location = sourceEvent.location;
  }

  return {
    sourceEventId: sourceEvent.id,
    hash,
    resource: targetEvent
  };
}

/**
 * 
 * @customfunction
 */
function getTargetTitle_(sourceEvent, config) {
  if (config.policy === CONFIG.policies.placeholder) {
    return config.targetTitle || 'Busy';
  }

  return sourceEvent.summary || '(no title)';
}

/**
 * 
 * @customfunction
 */
function buildSourceHash_(sourceEvent, config, targetTitle) {
  const payload = {
    sourceCalendarId: config.sourceCalendarId,
    sourceEventId: sourceEvent.id,
    title: targetTitle,
    start: getEventStartValue_(sourceEvent),
    end: getEventEndValue_(sourceEvent),
    location: config.policy === CONFIG.policies.full ? cleanString_(sourceEvent.location || '') : '',
    policy: config.policy
  };

  return hashString_(JSON.stringify(payload));
}

/**
 * 
 * @customfunction
 */
function hashString_(value) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    value,
    Utilities.Charset.UTF_8
  );

  return bytes
    .map(byte => {
      const unsigned = byte < 0 ? byte + 256 : byte;
      return unsigned.toString(16).padStart(2, '0');
    })
    .join('');
}

/**
 * 
 * @customfunction
 */
function buildTargetDescription_(sourceEvent, config, hash) {
  return [
    '--- CALENDAR SYNC METADATA ---',
    'SYNC_MANAGED_BY=calendar-sync',
    `SYNC_SOURCE_CALENDAR_ID=${config.sourceCalendarId}`,
    `SYNC_SOURCE_EVENT_ID=${sourceEvent.id}`,
    `SYNC_SOURCE_HASH=${hash}`,
    '--- END CALENDAR SYNC METADATA ---'
  ].join('\n');
}


/**
 * 
 * @customfunction
 */
function listTargetEvents_(calendarId, syncWindow) {
  const events = [];
  let pageToken;

  do {
    const response = Calendar.Events.list(calendarId, {
      timeMin: syncWindow.startIso,
      timeMax: syncWindow.endIso,
      singleEvents: true,
      orderBy: 'startTime',
      showDeleted: false,
      maxResults: 2500,
      pageToken
    });

    if (response.items && response.items.length > 0) {
      events.push(...response.items);
    }

    pageToken = response.nextPageToken;
  } while (pageToken);

  return events;
}

/**
 * 
 * @customfunction
 */
function extractSyncMetadata_(description) {
  const text = cleanString_(description);

  if (!text) {
    return {};
  }

  const startIndex = text.indexOf(CONFIG.syncMetadata.startMarker);
  const endIndex = text.indexOf(CONFIG.syncMetadata.endMarker);

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return {};
  }

  const blockStart = startIndex + CONFIG.syncMetadata.startMarker.length;
  const block = text.substring(blockStart, endIndex).trim();

  const metadata = {};

  block.split('\n').forEach(line => {
    const cleanedLine = cleanString_(line);

    if (!cleanedLine || !cleanedLine.includes('=')) {
      return;
    }

    const separatorIndex = cleanedLine.indexOf('=');
    const key = cleanString_(cleanedLine.substring(0, separatorIndex));
    const value = cleanString_(cleanedLine.substring(separatorIndex + 1));

    if (key) {
      metadata[key] = value;
    }
  });

  return metadata;
}

/**
 * 
 * @customfunction
 */
function isManagedTargetEvent_(event) {
  const metadata = extractSyncMetadata_(event.description || '');

  return metadata.SYNC_MANAGED_BY === CONFIG.syncMetadata.managedByValue;
}

/**
 * 
 * @customfunction
 */
function listManagedTargetEvents_(calendarId, syncWindow) {
  return listTargetEvents_(calendarId, syncWindow)
    .filter(event => isManagedTargetEvent_(event));
}

/**
 * 
 * @customfunction
 */
function buildSourceEventKey_(sourceCalendarId, sourceEventId) {
  return `${sourceCalendarId}::${sourceEventId}`;
}

/**
 * 
 * @customfunction
 */
function getManagedSourceKeyFromTargetEvent_(targetEvent) {
  const metadata = extractSyncMetadata_(targetEvent.description || '');

  if (!metadata.SYNC_SOURCE_CALENDAR_ID || !metadata.SYNC_SOURCE_EVENT_ID) {
    return '';
  }

  return buildSourceEventKey_(
    metadata.SYNC_SOURCE_CALENDAR_ID,
    metadata.SYNC_SOURCE_EVENT_ID
  );
}

/**
 * 
 * @customfunction
 */
function indexManagedTargetEventsBySourceKey_(targetEvents) {
  const index = {};

  targetEvents.forEach(event => {
    const sourceKey = getManagedSourceKeyFromTargetEvent_(event);

    if (!sourceKey) {
      return;
    }

    if (!index[sourceKey]) {
      index[sourceKey] = [];
    }

    index[sourceKey].push(event);
  });

  return index;
}

/**
 * 
 * @customfunction
 */
function planSyncActionsForConfig_(config, syncWindow) {
  const sourceEvents = listSourceEvents_(config.sourceCalendarId, syncWindow);
  const managedTargetEvents = listManagedTargetEventsForSource_(
    config.targetCalendarId,
    syncWindow,
    config.sourceCalendarId
  );

  const targetIndex = indexManagedTargetEventsBySourceKey_(managedTargetEvents);
  const seenSourceKeys = new Set();

  const actions = [];

  sourceEvents.forEach(sourceEvent => {
    if (shouldSkipSourceEvent_(sourceEvent, config)) {
      return;
    }

    const sourceKey = buildSourceEventKey_(
      config.sourceCalendarId,
      sourceEvent.id
    );

    seenSourceKeys.add(sourceKey);

    const expected = buildExpectedTargetEvent_(sourceEvent, config);
    const existingMatches = targetIndex[sourceKey] || [];

    if (existingMatches.length === 0) {
      actions.push({
        type: 'create',
        config,
        sourceEvent,
        expected
      });
      return;
    }

    if (existingMatches.length > 1) {
      existingMatches.forEach(targetEvent => {
        actions.push({
          type: 'delete_duplicate',
          config,
          targetEvent,
          reason: 'Multiple managed target events found for one source event'
        });
      });

      actions.push({
        type: 'create',
        config,
        sourceEvent,
        expected
      });
      return;
    }

    const existing = existingMatches[0];
    const existingMetadata = extractSyncMetadata_(existing.description || '');

    if (existingMetadata.SYNC_SOURCE_HASH === expected.hash) {
      actions.push({
        type: 'noop',
        config,
        sourceEvent,
        targetEvent: existing,
        expected
      });
      return;
    }

    actions.push({
      type: 'replace',
      config,
      sourceEvent,
      targetEvent: existing,
      expected,
      oldHash: existingMetadata.SYNC_SOURCE_HASH || '',
      newHash: expected.hash
    });
  });

  managedTargetEvents.forEach(targetEvent => {
    const metadata = extractSyncMetadata_(targetEvent.description || '');

    if (metadata.SYNC_SOURCE_CALENDAR_ID !== config.sourceCalendarId) {
      return;
    }

    const sourceKey = getManagedSourceKeyFromTargetEvent_(targetEvent);

    if (!sourceKey) {
      return;
    }

    if (!seenSourceKeys.has(sourceKey)) {
      actions.push({
        type: 'delete_stale',
        config,
        targetEvent,
        reason: 'Source event no longer present in active sync window'
      });
    }
  });

  return actions;
}


function runCalendarSync_(dryRun) {
  if (typeof dryRun !== 'boolean') {
    throw new Error('runCalendarSync_ must be called with explicit dryRun boolean.');
  }

  if (!CONFIG.globalEnabled) {
    Logger.log('Calendar sync is globally disabled.');
    return;
  }


  //const effectiveOptions = options || { dryRun: true };
  const configs = loadActiveSourceConfigs();

  Logger.log(`Calendar sync started. dryRun=${dryRun}`);
  Logger.log(`Active source configs: ${configs.length}`);

  configs.forEach(config => {
    const syncWindow = getSyncWindow_(config.lookaheadDays);

    Logger.log('');
    Logger.log(`=== ${config.sourceCalendarName} → ${config.targetCalendarId} ===`);
    Logger.log(`Sync window: ${syncWindow.startIso} → ${syncWindow.endIso}`);
    Logger.log(`Lookahead days: ${config.lookaheadDays}`);

    const actions = planSyncActionsForConfig_(config, syncWindow);
    logPlannedActions_(actions);
    executePlannedActions_(actions, { dryRun });
  });

  Logger.log('Calendar sync finished.');
}


function executePlannedActions_(actions, options) {
  const dryRun = !options || options.dryRun !== false;

  actions.forEach(action => {
    switch (action.type) {
      case 'noop':
        return;

      case 'create':
        createTargetEvent_(
          action.config.targetCalendarId,
          action.expected.resource,
          dryRun
        );
        return;

      case 'replace':
        deleteTargetEvent_(
          action.config.targetCalendarId,
          action.targetEvent.id,
          dryRun
        );

        createTargetEvent_(
          action.config.targetCalendarId,
          action.expected.resource,
          dryRun
        );
        return;

      case 'delete_stale':
      case 'delete_duplicate':
        deleteTargetEvent_(
          action.config.targetCalendarId,
          action.targetEvent.id,
          dryRun
        );
        return;

      default:
        throw new Error(`Unsupported action type: ${action.type}`);
    }
  });
}


function createTargetEvent_(calendarId, eventResource, dryRun) {
  if (dryRun) {
    Logger.log(
      `DRY RUN CREATE | ${calendarId} | ${getEventResourceStartValue_(eventResource)} | ${eventResource.summary || '(no title)'}`
    );
    return null;
  }

  const createdEvent = Calendar.Events.insert(eventResource, calendarId);

  Logger.log(
    `CREATED | ${calendarId} | ${getEventResourceStartValue_(createdEvent)} | ${createdEvent.summary || '(no title)'} | id=${createdEvent.id}`
  );

  return createdEvent;
}


function deleteTargetEvent_(calendarId, eventId, dryRun) {
  if (dryRun) {
    Logger.log(`DRY RUN DELETE | ${calendarId} | id=${eventId}`);
    return;
  }

  Calendar.Events.remove(calendarId, eventId);

  Logger.log(`DELETED | ${calendarId} | id=${eventId}`);
}


function getEventResourceStartValue_(eventResource) {
  if (!eventResource || !eventResource.start) {
    return '';
  }

  return eventResource.start.dateTime || eventResource.start.date || '';
}


function parseLookaheadDays_(value) {
  const raw = cleanString_(value);

  if (!raw) {
    return CONFIG.lookaheadDays;
  }

  const days = Number(raw);

  if (!Number.isFinite(days) || days < 1) {
    throw new Error(`Invalid Lookahead Days value: ${value}`);
  }

  return Math.floor(days);
}

function listManagedTargetEventsForSource_(calendarId, syncWindow, sourceCalendarId) {
  return listManagedTargetEvents_(calendarId, syncWindow)
    .filter(event => {
      const metadata = extractSyncMetadata_(event.description || '');
      return metadata.SYNC_SOURCE_CALENDAR_ID === sourceCalendarId;
    });
}