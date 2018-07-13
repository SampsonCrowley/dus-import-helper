var domReady = (function() {

  var w3c = !!document.addEventListener,
  loaded = false,
  toplevel = false,
  fns = [];

  if (w3c) {
    document.addEventListener("DOMContentLoaded", contentLoaded, true);
    window.addEventListener("load", ready, false);
  }
  else {
    document.attachEvent("onreadystatechange", contentLoaded);
    window.attachEvent("onload", ready);

    try {
      toplevel = window.frameElement === null;
    } catch(e) {}
    if ( document.documentElement.doScroll && toplevel ) {
      scrollCheck();
    }
  }

  function contentLoaded() {
    (w3c)?
    document.removeEventListener("DOMContentLoaded", contentLoaded, true) :
    document.readyState === "complete" &&
    document.detachEvent("onreadystatechange", contentLoaded);
    ready();
  }

  // If IE is used, use the trick by Diego Perini
  // http://javascript.nwbox.com/IEContentLoaded/
  function scrollCheck() {
    if (loaded) {
      return;
    }

    try {
      document.documentElement.doScroll("left");
    }
    catch(e) {
      window.setTimeout(arguments.callee, 15);
      return;
    }
    ready();
  }

  function ready() {
    if (loaded) {
      return;
    }
    loaded = true;

    var len = fns.length,
    i = 0;

    for( ; i < len; i++) {
      fns[i].call(document);
    }
  }

  return function(fn) {
    // if the DOM is already ready,
    // execute the function
    return (loaded)?
    fn.call(document):
    fns.push(fn);
  }
})();

var table, section, stateElement, runTimeout,
buttonId = 'DUS_IMPORT_BUTTON',
singleButtonId = 'DUS_IMPORT_BUTTON_SINGLE',
clearButtonId = 'DUS_CLEAR_ALL_RUNNING',
stateListWrapperId = 'DUS_STATES_CHECKBOXES',
dataWrapper,
noRun = ['usa', 'os', 'pr', 'leaders', '4x100m', '4x200m', '4x400m', '4x800m', 'flo50'],
currentGrade = localStorage.getItem('currentGrade'),
gradeOptions = ['junior', 'sophomore', 'freshman'/*, '8th-grade'*/],
open = false,
db = new Dexie('MilesplitDB');

db.version(1).stores({
  schools: 'url'
});

function deleteLocalKeys(){
  var i, storageKeys = ['currentGrade', 'currentCity'];
  for(i = 0; i < storageKeys.length; i++) localStorage.removeItem(storageKeys[i]);
}

function deleteAllData(){
  deleteLocalKeys();
  chrome.storage.local.get(null, function(stuff){
    console.log(stuff);
    chrome.storage.local.clear()
  })
}

function globalSet(args, cb){
  chrome.storage.local.set(args, function(){
    if(checkError()){
      cb()
    }
  })
}

function changeEvent(el, value){
  el.value = value;
  return setTimeout(function(){
    el.dispatchEvent(new Event('change', { 'bubbles': true }))
  }, 1000)
}

function start(){
  chrome.storage.local.get({runningMilesplit: false, gender: 'M', states: [], currentState: false, events: [], grades: []}, function(obj){
    if(obj.runningMilesplit === 'runningCities'){
      return getCities();
    } else {
      section = document.getElementById('eventRankings') || document.getElementById('rankingsLeaders');
      if(section){
        table = section.querySelector('table');
        if(obj.runningMilesplit === 'true'){
          return parseTable();
        } else {
          var state = document.getElementById('ddState'),
              level = document.getElementById('ddLevel');
          if (obj.runningMilesplit === 'nextGender'){
            if(obj.gender === 'F'){
              return globalSet({runningMilesplit: 'nextState', gender: 'M'}, function(){
                console.log('completed women');
                return changeEvent(level, 'high-school-boys');
              })
            } else {
              if((level.value.toUpperCase().split('-').includes('BOYS') || level.includes('MEN'))){
                changeEvent(level, 'high-school-girls');
                return false
              }
              freshStart(state.value, function(res) {
                if(!!res) startRun(false, 'F');
              });
            }
          } else if (obj.runningMilesplit === 'nextState'){
            deleteLocalKeys();
            if(level.value !== 'high-school-boys'){
              return changeEvent(level, 'high-school-boys');
            }
            if(checkError()){
              console.log(obj.states)
              if(obj.currentState !== state.value){
                if(obj.states.length > 0){
                  let currentState = obj.states.shift();
                  return globalSet({currentState: currentState, states: obj.states}, function(){
                    return changeEvent(state, currentState);
                  })
                } else {
                  return deleteAllData();
                }
              } else {
                freshStart(obj.currentState, function(res) {
                  if(!!res) startRun();
                });
              }
            }
          } else {
            freshStart(state.value, function(res) {
              stateElement = state;
              addElementsToDOM();
            });
          }
        }
      } else if(obj.runningMilesplit === 'true'){
        console.log(obj)
      }
    }
  })
}

function getStateElement(){
  return stateElement = stateElement || document.getElementById('ddState');
}


function getStatesList(){
  stateElement = getStateElement();

  return (!stateElement) ? [] : Array.apply(null, stateElement.options).filter((option) => (!noRun.includes(option.value.toLowerCase()))).map((option) => option.value)
}

function toggleStatesList(direction){
  console.log('toggle states list: ', direction);

  var inputs, wrapper = document.getElementById('DUS_STATES_CHECKBOXES');

  if(wrapper) {
    inputs = Array.apply(null, wrapper.querySelectorAll('input[name=DUS_STATE_CHECKBOX]'));
    for(var i = 0; i < inputs.length; i++){
      inputs[i].checked = !!direction;
    }
  }

  return !!direction;
}

function addElementsToDOM(state){
  var checkbox, label, span, toggleTimeout,
      level = document.getElementById('ddLevel'),
      checkAllButton = document.createElement('button'),
      checkNoneButton = document.createElement('button'),
      newButton = document.createElement('a'),
      single = document.createElement('a'),
      stateListWrapper = document.createElement('div'),
      statesList = getStatesList();

  if(level && level.value !== 'high-school-boys') {
    return changeEvent(level, 'high-school-boys');
  }

  stateListWrapper.id = stateListWrapperId;
  stateListWrapper.innerHTML = '<br/>';

  checkAllButton.innerText = 'Check All';
  checkNoneButton.innerText = 'Check None';

  stateListWrapper.prepend(checkAllButton);
  stateListWrapper.prepend(checkNoneButton);

  checkAllButton.addEventListener('click', function(){
    clearTimeout(toggleTimeout);
    toggleTimeout = setTimeout(() => {toggleStatesList(true)}, 1000);
  })

  checkNoneButton.addEventListener('click', function(){
    clearTimeout(toggleTimeout);
    toggleTimeout = setTimeout(() => {toggleStatesList(false)}, 1000);
  })

  for(var i = 0; i < statesList.length; i++){
    checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = 'DUS_STATE_CHECKBOX';
    checkbox.value = statesList[i];
    checkbox.checked = false;

    label = document.createElement('label');
    label.innerText = statesList[i];
    label.prepend(checkbox);

    stateListWrapper.appendChild(label);

    if(i < (statesList.length - 1)) {
      span = document.createElement('span');
      span.innerHTML = '&nbsp;|&nbsp;'
      stateListWrapper.appendChild(span);
    }
  }

  newButton.id = buttonId;
  newButton.innerHTML = 'Download Table';

  single.id = singleButtonId;
  single.innerHTML = 'Download Table (THIS STATE ONLY)';
  // single.setAttribute('data-state', state);
  if(table) {
    table.parentElement.prepend(stateListWrapper);
    table.parentElement.prepend(newButton);
    table.parentElement.prepend(single);
  } else{
    section.appendChild(stateListWrapper);
    section.appendChild(newButton);
    section.appendChild(single);
  }

  document.addEventListener('click', downloadTable);
}

function freshStart(state, cb = null){
  cb = cb || (res => res);

  var event = document.getElementById('ddEvent'),
      options = Array.apply(null, event.options)
        .filter((option) => (!!option.value && !noRun.includes(option.value.toLowerCase()) && option.value !== event.value))
        .map((option) => option.value),
      seasonVal = document.getElementById('ddSeason').value,
      levelVal = document.getElementById('ddLevel').value;

  deleteLocalKeys();
  return setGrades(function(){
    return globalSet({events: options, fileName: state + '_' + levelVal + '_' + seasonVal}, function() {
      if(noRun.includes(event.value.toLowerCase())){
        changeEvent(event, options.shift());
        return cb(false)
      }

      return cb(true);
    })
  });
}

function trimValue(el){
  return el.innerHTML.trim();
}

function copyTextToClipboard(text) {
  var copyFrom = document.createElement("textarea");
  copyFrom.textContent = text;
  var body = document.getElementsByTagName('body')[0];
  body.appendChild(copyFrom);
  copyFrom.select();
  document.execCommand('copy');
  body.removeChild(copyFrom);
}

function loadData() {
  return openDB().then(function(){
    return db.schools.toArray().then(function(schools){
      console.log(schools);
      dataWrapper = {};
      for(var i = 0; i < schools.length; i++){
        dataWrapper[schools[i].url] = schools[i];
      }
      console.log(dataWrapper);
      return dataWrapper
    })
  })
}

function openDB(){
  if(open){
    return Dexie.Promise.resolve();
  } else {
    return db.open().then(() => { open = true;});
  }
}

function putAll(clear = false){
  transactions = [];
  for(school in dataWrapper){
    transactions.push({url: school, data: (clear ? [] : dataWrapper[school].data), city: dataWrapper[school].city, visited: dataWrapper[school].visited})
  }
  return transactions;
}

async function saveData(clear = false){
  return openDB().then(function(){
    return db.transaction('rw', db.schools, function(){
      return db.schools.bulkPut(putAll(clear));
    })
  })
}

// async function loadData() {
//   await openDB();
//   var schools = await db.schools.toArray();
//   console.log(schools, schools.length)
//   dataWrapper = {};
//   for(var i = 0; i < schools.length; i++){
//     dataWrapper[schools[i].url] = schools[i];
//   }
//   console.log(dataWrapper);
//   await db.schools.toArray(function(promisedSchools) {
//     schools = promisedSchools;
//     console.log(schools, schools.length)
//     dataWrapper = {};
//     for(var i = 0; i < schools.length; i++){
//       dataWrapper[schools[i].url] = schools[i];
//     }
//     console.log(dataWrapper);
//   })
//   return dataWrapper;
// }
//
// async function openDB(){
//   if(open) return open;
//   await db.open();
//   return open = true;
// }
//
// function putAll(clear = false){
//   transactions = [];
//   for(school in dataWrapper){
//     transactions.push({url: school, data: (clear ? [] : dataWrapper[school].data), city: dataWrapper[school].city, visited: dataWrapper[school].visited})
//   }
//   console.log(transactions);
//   return transactions;
// }
//
// async function saveData(clear = false){
//   return await openDB()
//   return db.transaction('rw', db.schools, function(){
//     return db.schools.bulkPut(putAll(clear));
//   })
// }

function getCheckedStates(){
  var inputs, selected = [], wrapper = document.getElementById('DUS_STATES_CHECKBOXES');

  if(wrapper) {
    inputs = Array.apply(null, wrapper.querySelectorAll('input[name=DUS_STATE_CHECKBOX]'));
    for(var i = 0; i < inputs.length; i++){
      if(inputs[i].checked) selected.push(inputs[i].value);
    }
  }

  return selected;
}

function downloadTable(e){
  stateElement = getStateElement();
  if(table && (e.target.id === buttonId) || e.target.id === singleButtonId){
    var checkedStates = Array.apply(null, getCheckedStates())
    e.preventDefault();
    e.stopPropagation();
    globalSet({
      states: (e.target.id === singleButtonId) ? [] : checkedStates.filter((val) => ((!stateElement) || (val !== stateElement.value)))
    }, function(){
      if(stateElement && checkedStates.includes(stateElement.value)){
        startRun();
      } else {
        startRun(true)
      }
    })
  }
}

function checkError(){
  if(chrome.runtime.lastError) {
    console.log(chrome.runtime.lastError)
    return chrome.runtime.lastError = null;
  }
  return true;
}

function startRun(wrongState, gender){
  saveData(true).then(function(){
    return globalSet({runningMilesplit: (!!wrongState ? 'nextState' : 'true'), startingPoint: window.location.href, currentState: false, gender: !!gender ? gender : 'M'}, parseTable);
  })
}

function parseTable(){
  if(!currentGrade || !table || !gradeOptions.includes(document.getElementById('ddGrade').value.toLowerCase())) return yearEventOrCities();

  var accuracy = document.getElementById('ddAccuracy');

  if((!!accuracy) && (accuracy.value !== 'all')) {
    changeEvent(accuracy, 'all');
    return false
  }

  return chrome.storage.local.get({runningMilesplit: false, gender: 'M', states: [], currentState: false}, async function(obj){

    var row,
    tbody = table.getElementsByTagName('tbody')[0],
    rows = tbody.getElementsByTagName('tr'),
    event = document.getElementById('ddEvent').value.toUpperCase(),
    levelEl = document.getElementById('ddLevel'),
    level = levelEl.value.toUpperCase().split('-'),
    sport = document.getElementById('ddSeason').value === 'cross-country' ? 'XC' : 'TF',
    stateVal = getStateElement().value,
    state = (stateVal === 'usa' ? function(row){ return trimValue(row.querySelector('td.name .team .state')) } : function() { return stateVal }),
    gender = (level.includes('BOYS') || level.includes('MEN')) ? 'M' : 'F'

    if(gender !== obj.gender){
      changeEvent(levelEl, (obj.gender === 'M') ? 'high-school-boys' : 'high-school-girls');
      return false
    }

    if(noRun.includes(event.toLowerCase())) return yearEventOrCities();

    for(var r = 0; r < rows.length; r++){
      row = rows[r];
      let newData,
          name = trimValue(row.querySelector('td.name .athlete a')).split(' '),
          place = trimValue(row.querySelector('td.meet > .meet em')).split(' ')[0] + ' Place - ',
          meet = trimValue(row.querySelector('td.meet > .meet a')),
          time = ' (' + trimValue(row.querySelector('td.time')) + ')',
          schoolLink = row.querySelector('td.name .team a').href;

      if(!dataWrapper[schoolLink]) {
        dataWrapper[schoolLink] = {
          city: '',
          visited: false,
          data: []
        };
      }

      newData = {
        NameAcquisition: 'milesplit.com',
        FirstName: name[0],
        LastName: name[1],
        Gender: gender,
        YearGrad: trimValue(row.querySelector('td.year')),
        Stats: place + meet + ' ' + event + time,
        State: state(row),
        Sport: sport,
        School: trimValue(row.querySelector('td.name .team a')),
        City: ''
      }
      console.log(newData)
      dataWrapper[schoolLink].data.push(newData)
    }

    console.log(await saveData());
    var nextPage;
    if(nextPage = section.querySelector('.pagination a.next')){
      nextPage.click();
    } else {
      yearEventOrCities();
    }
  })
}

function setGrades(cb = null, existing = false) {
  var options = existing ? gradeOptions.filter((option) => option !== existing) : gradeOptions
  globalSet({grades: Array.apply(null, options)}, cb || function(){})
}

function yearEventOrCities(){
  chrome.storage.local.get({grades: [], events: []}, function(obj) {
    if(obj.grades.length > 0){
      var grade = obj.grades.shift(),
          gradeHolder = document.getElementById('ddGrade');
      globalSet({grades: Array.apply(null, obj.grades)}, () => {
        localStorage.setItem('currentGrade', grade);
        currentGrade = grade;
        changeEvent(gradeHolder, grade);
      })
    } else if(obj.events.length > 0){
      setGrades(function() {
        var ev = obj.events.shift(),
            eventHolder = document.getElementById('ddEvent');
        globalSet({events: Array.apply(null, obj.events)}, function() {
          eventHolder.value = ev;
          changeEvent(eventHolder, ev);
        })
      }, document.getElementById('ddGrade').value.toLowerCase());
    } else {
      localStorage.removeItem('currentCity');
      globalSet({runningMilesplit: 'runningCities'}, getCities)
    }
  })
}

async function getCities(){
  var currentCity = localStorage.getItem('currentCity');
  if(currentCity){
    var foundCity = false,
        cityHeader = document.querySelector('header.profile .teamInfo');

    if(cityHeader) {
      var spans = cityHeader.querySelectorAll('span');
      for(var s = 0; s < spans.length; s++){
        var span = spans[s]
        if(span.innerHTML.toLowerCase().indexOf('usa') !== -1){
          var city = span.innerHTML.split(',')[0].trim()
          foundCity = true;
          dataWrapper[currentCity]['visited'] = true;
          dataWrapper[currentCity]['city'] = city;
          break;
        }
      }
    }

    if(!foundCity){
      dataWrapper[currentCity]['visited'] = true;
      dataWrapper[currentCity]['city'] = 'unknown';
    }

    await saveData();
  }
  for (var school in dataWrapper){
    if (dataWrapper.hasOwnProperty(school)) {
      if(!dataWrapper[school]['visited']){
        localStorage.setItem('currentCity', school);
        var link = document.createElement("a");
        link.setAttribute("href", school);
        document.body.appendChild(link);
        return link.click();
      }
    }
  }

  localStorage.removeItem('currentCity');
  createCsv();
}

function createCsv(){
  const colStart = '"',
        colDelim = '","',
        rowDelim = '"\r\n',
        headers = ['NameAcquisition', 'FirstName', 'LastName', 'Gender', 'YearGrad', 'Stats', 'State', 'Sport', 'School', 'City'],
        lastCol = headers.length - 1;

  var rows, row, city, fileName, blobdata, csvLink,
      csv = colStart,
      successful = true;

  const rowOrCol = function rowOrCol(colNum){
    return colNum === lastCol ? rowDelim : colDelim
  }

  chrome.storage.local.get({fileName: new Date().getTime()}, function(obj){
    try {
      for(let h = 0; h < headers.length; h++){
        csv += headers[h] + rowOrCol(h);
      }

      for (let school in dataWrapper){
        if (dataWrapper.hasOwnProperty(school)) {
          city = dataWrapper[school]['city'];
          rows = dataWrapper[school]['data'];

          for(let r = 0; r < rows.length; r++){
            row = rows[r];
            row['City'] = city;
            csv += colStart
            for(var h = 0; h < headers.length; h++){
              var header = headers[h];
              csv += row[header] + rowOrCol(h);
            }
          }

        }
      }

      blobdata = new Blob([csv.trim()],{type : 'text/csv'});
      csvLink = document.createElement("a");
      csvLink.setAttribute("href", window.URL.createObjectURL(blobdata));
      csvLink.setAttribute("download", "milesplit_data_" + obj.fileName + ".csv");
      document.body.appendChild(csvLink);
      csvLink.click();
    } catch (e) {
      console.log(e, csvLink, obj.fileName, blobdata);
      successful = false
    }

    setTimeout(async () => {
      if(successful){
        await saveData(true);

        localStorage.removeItem('currentGrade');

        globalSet({runningMilesplit: 'nextGender'}, function(){
          deleteLocalKeys();
          chrome.storage.local.get('startingPoint',function(obj){
            if(checkError()) {
              window.location.href = obj.startingPoint;
            }
          })
        });
      }
    }, 5 * 60 * 1000)
  })
}

function clearCurrent(e){
  if(e.target.id === clearButtonId) {
    clearTimeout(runTimeout);

    deleteAllData();
  }
}

function addClearButton(){
  var clearButton = document.createElement('a');

  clearButton.id = clearButtonId;
  clearButton.innerHTML = 'STOP RUNNING';

  try {
    document.getElementById('content').prepend(clearButton);
  } catch(e) {
    document.body.prepend(clearButton);
  }

  document.addEventListener('click', clearCurrent);
}

function run() {
  addClearButton();

  runTimeout = setTimeout(function() {
    loadData().then(function(){
      start();
    });
  }, 5000)

}

domReady(run);
