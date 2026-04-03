const Store = require('electron-store')

const store = new Store({
  name: 'edu-system-data',
  defaults: {
    students: [],
    teachers: [],
    courses: [],
    attendance: [],
    hourRecords: [],
    classes: []
  }
})

module.exports = store