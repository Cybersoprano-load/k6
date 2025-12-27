import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

const BASE_URL = 'http://webtours.load-test.ru:1080';

// Функция для рандомных строк 
function randomString(length = 8) {
  return Math.random().toString(36).substring(2, 2 + length);
}

export let options = {
  vus: 10,
  iterations: 10,
};

const users = new SharedArray('users', function () {
  return open('./users.csv')
    .split('\n')
    .slice(1)
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      const [username, password] = line.split(',');
      return { username: username.trim(), password: password.trim() };
    });
});

export default function () {
  // 1. Sign off
  let signOff = http.get(`${BASE_URL}/cgi-bin/welcome.pl?signOff=true`);
  check(signOff, { 'sign off loaded': (r) => r.status === 200 });

  // 2. Форма логина
  let respForm = http.get(`${BASE_URL}/cgi-bin/nav.pl?in=home`);
  check(respForm, { 'form page loaded': (r) => r.status === 200 });

  // 3. userSession
  let match = respForm.body.match(/name="userSession" value="([^"]+)"/);
  if (!match) throw new Error('userSession error not found');
  let userSession = match[1];
  console.log('Extracted userSession:', userSession);

  // 4. Пользователь из CSV
  const user = users[(__VU - 1) % users.length];
  const username = user.username;
  const password = user.password;

  // 5. Логин
  const loginPayload = {
    userSession: userSession,
    username: username,
    password: password,
    'login.x': '50',
    'login.y': '10',
    JSFormSubmit: 'off',
  };

  let resLogin = http.post(`${BASE_URL}/cgi-bin/login.pl`, loginPayload, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  check(resLogin, {
    'login done': (r) => r.status === 200,
  });

    // 6. переход в itinerary - 1
    let itinerary1 = http.get(`${BASE_URL}/cgi-bin/welcome.pl?page=itinerary`);
  check(itinerary1, { 'Itinerary1 loaded': (r) => r.status === 200 });

    // 7. переход в itinerary - 2
    let itinerary2 = http.get(`${BASE_URL}/cgi-bin/itinerary.pl`);
  check(itinerary2, { 'Itinerary2 loaded': (r) => r.status === 200 });

    // 8. переход в itinerary - 3
      let itinerary3 = http.get(`${BASE_URL}/cgi-bin/nav.pl?page=menu&in=itinerary`);
  check(itinerary3, { 'Itinerary3 loaded': (r) => r.status === 200 });

    // 9. отмена билетов
let flightIDMatches = [...itinerary2.body.matchAll(/name="flightID" value="([^"]+)"/g)];

console.log(`Found ${flightIDMatches.length} flights`);

if (flightIDMatches.length > 0) {
  sleep(8 + Math.random() * 7);

  let cancelPayload = {
    'removeAllFlights.x': '66',
    'removeAllFlights.y': '6',
    '.cgifields': ['flightID', 'removeAllFlights'],
    flightID: flightIDMatches.map(m => m[1]),
  };

  let resCancel = http.post(
    `${BASE_URL}/cgi-bin/itinerary.pl`,
    cancelPayload,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  console.log('Cancel status:', resCancel.status);
  console.log(resCancel.body.substring(0, 500));

  check(resCancel, {
    'All flights canceled': (r) =>
      r.status === 200 &&
      r.body.includes('No flights have been reserved'),
  });
}

  // Выход из системы
    let resLogout = http.get(`${BASE_URL}/cgi-bin/welcome.pl?signOff=1`);
  
    check(resLogout, {
      'Logout success': (r) => r.status === 200,
    });
  
    console.log('Logged out successfully');
    sleep(1);
}