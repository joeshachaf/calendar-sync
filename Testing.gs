function testLoadActiveSourceConfigs() {
  const configs = loadActiveSourceConfigs();

  Logger.log(`Loaded ${configs.length} active source config(s).`);

  configs.forEach(config => {
    Logger.log(JSON.stringify(config, null, 2));
  });
}

function testListSourceEvents() {
  const configs = loadActiveSourceConfigs();
  const syncWindow = getSyncWindow_();

  Logger.log(`Sync window: ${syncWindow.startIso} → ${syncWindow.endIso}`);
  Logger.log(`Loaded ${configs.length} active config(s).`);

  configs.forEach(config => {
    const events = listSourceEvents_(config.sourceCalendarId, syncWindow);

    Logger.log('');
    Logger.log(`Source: ${config.sourceCalendarName}`);
    Logger.log(`Calendar ID: ${config.sourceCalendarId}`);
    Logger.log(`Policy: ${config.policy}`);
    Logger.log(`Events found: ${events.length}`);

    events.slice(0, 10).forEach(event => {
      const start = getEventStartValue_(event);
      const end = getEventEndValue_(event);
      const title = event.summary || '(no title)';
      Logger.log(`- ${start} → ${end} | ${title} | id=${event.id}`);
    });
  });
}

function testSkipKeywords() {
  const configs = loadActiveSourceConfigs();
  const syncWindow = getSyncWindow_();

  configs.forEach(config => {
    const events = listSourceEvents_(config.sourceCalendarId, syncWindow);

    Logger.log('');
    Logger.log(`Source: ${config.sourceCalendarName}`);
    Logger.log(`Skip keywords: ${JSON.stringify(config.skipKeywords)}`);

    events.forEach(event => {
      const title = event.summary || '(no title)';
      const skipped = shouldSkipSourceEvent_(event, config);

      Logger.log(`${skipped ? 'SKIP ' : 'KEEP '} | ${title}`);
    });
  });
}

/**
 * 
 * @customfunction
 */
function testBuildExpectedTargetEvents() {
  const configs = loadActiveSourceConfigs();
  const syncWindow = getSyncWindow_();

  configs.forEach(config => {
    const events = listSourceEvents_(config.sourceCalendarId, syncWindow);

    Logger.log('');
    Logger.log(`Source: ${config.sourceCalendarName}`);
    Logger.log(`Policy: ${config.policy}`);

    events
      .filter(event => !shouldSkipSourceEvent_(event, config))
      .slice(0, 5)
      .forEach(event => {
        const expected = buildExpectedTargetEvent_(event, config);

        Logger.log('');
        Logger.log(`Source title: ${event.summary || '(no title)'}`);
        Logger.log(`Target title: ${expected.resource.summary}`);
        Logger.log(`Start: ${getEventStartValue_(event)}`);
        Logger.log(`End: ${getEventEndValue_(event)}`);
        Logger.log(`Hash: ${expected.hash}`);
        Logger.log(`Description:\n${expected.resource.description}`);
      });
  });
}

/**
 * 
 * @customfunction
 */
function testListManagedTargetEvents() {
  const configs = loadActiveSourceConfigs();
  const syncWindow = getSyncWindow_();

  const targetCalendarIds = [...new Set(
    configs.map(config => config.targetCalendarId).filter(Boolean)
  )];

  Logger.log(`Unique target calendars: ${targetCalendarIds.length}`);

  targetCalendarIds.forEach(targetCalendarId => {
    const allTargetEvents = listTargetEvents_(targetCalendarId, syncWindow);
    const managedTargetEvents = listManagedTargetEvents_(targetCalendarId, syncWindow);
    const targetIndex = indexManagedTargetEventsBySourceKey_(managedTargetEvents);

    Logger.log('');
    Logger.log(`Target calendar: ${targetCalendarId}`);
    Logger.log(`All target events: ${allTargetEvents.length}`);
    Logger.log(`Managed target events: ${managedTargetEvents.length}`);
    Logger.log(`Managed source keys: ${Object.keys(targetIndex).length}`);

    managedTargetEvents.slice(0, 10).forEach(event => {
      const metadata = extractSyncMetadata_(event.description || '');
      Logger.log('');
      Logger.log(`Target title: ${event.summary || '(no title)'}`);
      Logger.log(`Target event ID: ${event.id}`);
      Logger.log(`Source calendar: ${metadata.SYNC_SOURCE_CALENDAR_ID || '(missing)'}`);
      Logger.log(`Source event: ${metadata.SYNC_SOURCE_EVENT_ID || '(missing)'}`);
      Logger.log(`Source hash: ${metadata.SYNC_SOURCE_HASH || '(missing)'}`);
    });
  });
}

/**
 * 
 * @customfunction
 */
function logPlannedActions_(actions) {
  const counts = actions.reduce((acc, action) => {
    acc[action.type] = (acc[action.type] || 0) + 1;
    return acc;
  }, {});

  Logger.log(`Planned actions: ${JSON.stringify(counts)}`);

  actions.forEach(action => {
    if (action.type === 'create') {
      Logger.log(
        `CREATE | ${action.config.sourceCalendarName} | ${getEventStartValue_(action.sourceEvent)} | ${action.expected.resource.summary}`
      );
      return;
    }

    if (action.type === 'replace') {
      Logger.log(
        `REPLACE | ${action.config.sourceCalendarName} | ${getEventStartValue_(action.sourceEvent)} | ${action.expected.resource.summary}`
      );
      Logger.log(`  oldHash=${action.oldHash}`);
      Logger.log(`  newHash=${action.newHash}`);
      return;
    }

    if (action.type === 'delete_stale') {
      Logger.log(
        `DELETE_STALE | targetId=${action.targetEvent.id} | ${action.targetEvent.summary || '(no title)'}`
      );
      return;
    }

    if (action.type === 'delete_duplicate') {
      Logger.log(
        `DELETE_DUPLICATE | targetId=${action.targetEvent.id} | ${action.targetEvent.summary || '(no title)'}`
      );
      return;
    }

    if (action.type === 'noop') {
      Logger.log(
        `NOOP | ${action.config.sourceCalendarName} | ${getEventStartValue_(action.sourceEvent)} | ${action.expected.resource.summary}`
      );
      return;
    }

    Logger.log(`UNKNOWN ACTION | ${JSON.stringify(action)}`);
  });
}

/**
 * 
 * @customfunction
 */
function testPlanSyncActions() {
  const configs = loadActiveSourceConfigs();
  const syncWindow = getSyncWindow_();

  configs.forEach(config => {
    Logger.log('');
    Logger.log(`=== ${config.sourceCalendarName} → ${config.targetCalendarId} ===`);

    const actions = planSyncActionsForConfig_(config, syncWindow);
    logPlannedActions_(actions);
  });
}

function testHashComparisonDebug() {
  const configs = loadActiveSourceConfigs();
  const syncWindow = getSyncWindow_();

  configs.forEach(config => {
    const sourceEvents = listSourceEvents_(config.sourceCalendarId, syncWindow)
      .filter(event => !shouldSkipSourceEvent_(event, config));

    const managedTargetEvents = listManagedTargetEventsForSource_(
      config.targetCalendarId,
      syncWindow,
      config.sourceCalendarId
    );

    const targetIndex = indexManagedTargetEventsBySourceKey_(managedTargetEvents);

    Logger.log('');
    Logger.log(`=== ${config.sourceCalendarName} ===`);

    sourceEvents.forEach(sourceEvent => {
      const expected = buildExpectedTargetEvent_(sourceEvent, config);
      const sourceKey = buildSourceEventKey_(config.sourceCalendarId, sourceEvent.id);
      const matches = targetIndex[sourceKey] || [];

      if (matches.length !== 1) {
        Logger.log(`MATCH COUNT ${matches.length} | ${sourceEvent.summary || '(no title)'}`);
        return;
      }

      const existing = matches[0];
      const metadata = extractSyncMetadata_(existing.description || '');
      const oldHash = metadata.SYNC_SOURCE_HASH || '';
      const newHash = expected.hash;

      if (oldHash !== newHash) {
        Logger.log('');
        Logger.log(`HASH MISMATCH | ${sourceEvent.summary || '(no title)'}`);
        Logger.log(`oldHash=${oldHash}`);
        Logger.log(`newHash=${newHash}`);
        Logger.log(`source start=${JSON.stringify(sourceEvent.start)}`);
        Logger.log(`source end=${JSON.stringify(sourceEvent.end)}`);
        Logger.log(`target title=${expected.resource.summary}`);
        Logger.log(`source location=${sourceEvent.location || ''}`);
        Logger.log(`policy=${config.policy}`);
      }
    });
  });
}