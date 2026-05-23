const fs = require('fs');
const path = require('path');

const STATE_FILE_PATH = path.join(__dirname, 'state.json');

function main() {
  const currentDate = new Date();

  if (!fs.existsSync(STATE_FILE_PATH)) {
    // If it does not exist, initialize it with a startDate of 30 days ago and an endDate of today
    const startDate = new Date(currentDate);
    startDate.setDate(startDate.getDate() - 30);

    const state = {
      startDate: startDate.toISOString(),
      endDate: currentDate.toISOString()
    };

    fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2), 'utf-8');
    console.log('Initialized state.json:', state);
  } else {
    // If it does exist, slide the date window forward
    try {
      const rawData = fs.readFileSync(STATE_FILE_PATH, 'utf-8');
      const state = JSON.parse(rawData);

      const newStartDate = state.endDate; // The old endDate becomes the new startDate
      const newEndDate = currentDate.toISOString();

      const newState = {
        startDate: newStartDate,
        endDate: newEndDate
      };

      fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(newState, null, 2), 'utf-8');
      console.log('Updated state.json:', newState);
    } catch (error) {
      console.error('Error reading or parsing state.json:', error);
    }
  }
}

main();
