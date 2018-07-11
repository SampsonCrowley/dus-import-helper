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
colStart = '"', colDelim = '","', rowDelim = '"\r\n',
dataWrapper,
headers = ['NameAcquisition', 'FirstName', 'LastName', 'Gender', 'YearGrad', 'Stats', 'State', 'Sport', 'School', 'City'],
noRun = ['usa', 'os', 'pr', 'leaders', '4x100m', '4x200m', '4x400m', '4x800m', 'flo50'],
currentGrade = localStorage.getItem('currentGrade'),
gradeOptions = ['junior', 'sophomore', 'freshman'/*, '8th-grade'*/],
open = false,
db = new Dexie('MilesplitDB');

db.version(1).stores({
  schools: 'url'
});

function globalSet(args, cb){
  chrome.storage.local.set(args, function(){
    if(checkError()){
      cb()
    }
  })
}

function changeEvent(){
  return new Event('change', { 'bubbles': true })
}

function start(){
  if(localStorage.getItem('runningCities') === 'true'){
    getCities()
  } else {
    section = document.getElementById('eventRankings') || document.getElementById('rankingsLeaders');
    if(section){
      table = section.querySelector('table');
      chrome.storage.local.get({runningMilesplit: false}, function(obj){
        if(obj.runningMilesplit === 'true'){
          return parseTable();
        } else {
          var state = document.getElementById('ddState'),
              level = document.getElementById('ddLevel');
          if (obj.runningMilesplit === 'nextGender'){
            if(level.value === 'high-school-boys'){
              level.value = 'high-school-girls';
              return level.dispatchEvent(changeEvent());
            } else if(localStorage.getItem('ranWomen')){
              return globalSet({runningMilesplit: 'nextState'}, function(){
                console.log('completed women');
                localStorage.removeItem('ranWomen');
                level.value = 'high-school-boys';
                return level.dispatchEvent(changeEvent());
              })
            }
            if(freshStart(state.value)){
              localStorage.setItem('ranWomen', true);
              startRun();
            }
          } else if (obj.runningMilesplit === 'nextState'){
            if(level.value === 'high-school-girls'){
              level.value = 'high-school-boys';
              return level.dispatchEvent(changeEvent());
            }
            return chrome.storage.local.get({states: [], currentState: false},function(obj){
              if(checkError()){
                console.log(obj.states)
                if(obj.currentState !== state.value){
                  if(obj.states.length > 0){
                    let currentState = obj.states.shift();
                    return globalSet({currentState: currentState, states: obj.states}, function(){
                      state.value = currentState;
                      state.dispatchEvent(changeEvent());
                    })
                  } else {
                    return chrome.storage.local.clear()
                  }
                } else {
                  if(freshStart(obj.currentState)){
                    startRun();
                  }
                }
              }

            })
          } else {
            if(freshStart(state.value)){
              stateElement = state;
              addButton();
            };
          }

        }
      })
    }
  }
}

function addButton(state){
  var newButton = document.createElement('a'),
      single = document.createElement('a');

  newButton.id = buttonId;
  newButton.innerHTML = 'Download Table';

  single.id = singleButtonId;
  single.innerHTML = 'Download Table (THIS STATE ONLY)';
  // single.setAttribute('data-state', state);
  if(table) {
    table.parentElement.prepend(newButton);
    table.parentElement.prepend(single);
  } else{
    section.appendChild(newButton);
    section.appendChild(single);
  }

  document.addEventListener('click', downloadTable);
}

function freshStart(state){
  var event = document.getElementById('ddEvent'),
      options = Array.apply(null, event.options)
        .filter((option) => (!noRun.includes(option.value.toLowerCase()) && option.value !== event.value))
        .map((option) => option.value),
      seasonVal = document.getElementById('ddSeason').value,
      levelVal = document.getElementById('ddLevel').value;

  setGrades();
  localStorage.setItem('events', JSON.stringify(options));
  localStorage.setItem('fileName', state + '_' + levelVal + '_' + seasonVal);

  if(noRun.includes(event.value.toLowerCase())){
    event.value = options.shift();
    event.dispatchEvent(changeEvent());
    return false
  }

  return true;
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

function rowOrCol(colNum){
  return colNum === (headers.length - 1) ? rowDelim : colDelim
}

function loadData() {
  return openDB().then(function(){
    return db.schools.toArray().then(function(schools){
      dataWrapper = {};
      for(var i = 0; i < schools.length; i++){
        dataWrapper[schools[i].url] = schools[i];
      }
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

function downloadTable(e){
  if(table && (e.target.id === buttonId) || e.target.id === singleButtonId){
    e.preventDefault();
    e.stopPropagation();
    globalSet({
      states: (e.target.id === singleButtonId || !stateElement) ? [] : Array.apply(null, stateElement.options).filter((option) => (!noRun.includes(option.value.toLowerCase()) && option.value !== stateElement.value)).map((option) => option.value)
    }, function(){
      startRun();
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

function startRun(){
  saveData(true).then(function(){
    return globalSet({runningMilesplit: 'true', startingPoint: window.location.href, currentState: false}, parseTable);
  })
}

async function parseTable(){
  if(!currentGrade || !table || !gradeOptions.includes(document.getElementById('ddGrade').value.toLowerCase())) return yearEventOrCities();

  var accuracy = document.getElementById('ddAccuracy');

  if((!!accuracy) && (accuracy.value !== 'all')) {
    accuracy.value = 'all';
    accuracy.dispatchEvent(changeEvent());
    return false
  }

  var row,
  tbody = table.getElementsByTagName('tbody')[0],
  rows = tbody.getElementsByTagName('tr'),
  event = document.getElementById('ddEvent').value.toUpperCase(),
  level = document.getElementById('ddLevel').value.toUpperCase().split('-'),
  sport = document.getElementById('ddSeason').value === 'cross-country' ? 'XC' : 'TF',
  stateVal = document.getElementById('ddState').value,
  state = (stateVal === 'usa' ? function(row){ return trimValue(row.querySelector('td.name .team .state')) } : function() { return stateVal }),
  gender = level.includes('BOYS') || level.includes('MEN') ? 'M' : 'F'

  if(noRun.includes(event.toLowerCase())) return yearEventOrCities();

  for(var r = 0; r < rows.length; r++){
    row = rows[r];
    var name = trimValue(row.querySelector('td.name .athlete a')).split(' '),
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

    dataWrapper[schoolLink].data.push({
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
    })
  }
  await saveData();
  var nextPage;
  if(nextPage = section.querySelector('.pagination a.next')){
    nextPage.click();
  } else {
    yearEventOrCities();
  }
}

function setGrades(existing = false){
  var options = existing ? gradeOptions.filter((option) => option !== existing) : gradeOptions
  localStorage.setItem('gradeOptions', JSON.stringify(options));
}

function yearEventOrCities(){
  var grades = JSON.parse(localStorage.getItem('gradeOptions') || '[]'),
  events = JSON.parse(localStorage.getItem('events') || '[]');
  if(grades.length > 0){
    var grade = grades.shift(), gradeHolder = document.getElementById('ddGrade');
    localStorage.setItem('gradeOptions', JSON.stringify(grades));
    localStorage.setItem('currentGrade', grade);
    gradeHolder.value = grade;
    gradeHolder.dispatchEvent(changeEvent());
  } else if(events.length > 0){
    setGrades(document.getElementById('ddGrade').value.toLowerCase());
    var event = events.shift(), eventHolder = document.getElementById('ddEvent');
    localStorage.setItem('events', JSON.stringify(events));
    eventHolder.value = event;
    eventHolder.dispatchEvent(changeEvent());
  } else {
    localStorage.setItem('runningCities', 'true')
    getCities();
  }
}

async function getCities(){
  var currentCity = localStorage.getItem('currentCity');
  if(currentCity){
    var spans = document.querySelector('header.profile .teamInfo').querySelectorAll('span');
    for(var s = 0; s < spans.length; s++){
      var span = spans[s]
      if(span.innerHTML.toLowerCase().indexOf('usa') !== -1){
        var city = span.innerHTML.split(',')[0].trim()
        dataWrapper[currentCity]['visited'] = true;
        dataWrapper[currentCity]['city'] = city;
        await saveData();
        break;
      }
    }
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
  localStorage.removeItem('runningCities')
  localStorage.removeItem('currentCity');
  createCsv();
}

async function createCsv(){
  let rows, row, city, csv = colStart;

  for(var h = 0; h < headers.length; h++){
    csv += headers[h] + rowOrCol(h);
  }
  for (var school in dataWrapper){
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

  await saveData(true);

  localStorage.removeItem('currentGrade');

  var fileName = localStorage.getItem('fileName') || new Date().getTime()
  var blobdata = new Blob([csv.trim()],{type : 'text/csv'});
  var link = document.createElement("a");
  link.setAttribute("href", window.URL.createObjectURL(blobdata));
  link.setAttribute("download", "milesplit_data_" + fileName + ".csv");
  document.body.appendChild(link);
  link.click();
  // globalSet({runningMilesplit: false}, function(){
  //   chrome.storage.local.get('startingPoint',function(obj){
  //     if(checkError()) {
  //       window.location.href = obj.startingPoint;
  //     }
  //   })
  // })
  globalSet({runningMilesplit: 'nextGender'}, function(){
    chrome.storage.local.get('startingPoint',function(obj){
      if(checkError()) {
        window.location.href = obj.startingPoint;
      }
    })
  });
}

function clearCurrent(e){
  if(e.target.id === clearButtonId) {
    clearTimeout(runTimeout);
    chrome.storage.local.get(null, function(stuff){
      console.log(stuff);
      chrome.storage.local.clear()
    })
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
