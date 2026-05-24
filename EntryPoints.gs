/**
 * Refresh the calendars inventory (to be used in the other sheets)
 * 
 * @customfunction
 */
function refreshCalendarInventory() {
  const calendars = CalendarApp.getAllCalendars();
  Logger.log('Found %d caledars', calendars.length);

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Calendars");

  for(let i = 0; i < calendars.length; i++){
    let calName = calendars[i].getName();
    let calID = calendars[i].getId();
    Logger.log("Name %s, ID %s",calName,calID);

    //Check if this calendar already exists
    let isExist = sheet.createTextFinder(calID).findAll().length > 0;
    
    if(!isExist){
      Logger.log("copy this calendar %s", calName);
      sheet.appendRow([calName,calID]);
   }
  }
}

/**
 * 
 * @customfunction
 */
function runCalendarSync() {
  Logger.log('Deprecated wrapper called: runCalendarSync(). Running live sync for backward compatibility.');
  syncCalendars();
}

/**
 * 
 * @customfunction
 */
function syncCalendarsDryRun() {
  runCalendarSync_(true);
}

/**
 * 
 * @customfunction
 */
function syncCalendars() {
  if (!CONFIG.globalEnabled) {
    Logger.log('Calendar sync is globally disabled.');
    return;
  }
  
  runCalendarSync_(false);
}