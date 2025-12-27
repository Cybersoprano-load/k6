import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

const BASE_URL = 'http://webtours.load-test.ru:1080';

// Функция для рандомных строк 
function randomString(length = 8) {
  return Math.random().toString(36).substring(2, 2 + length);
}

export const options = {
  stages: [
    { duration: '2m', target: 3 },
    { duration: '2m', target: 6 },
    { duration: '2m', target: 9 },
    { duration: '2m', target: 6 },
    { duration: '2m', target: 3 },
    { duration: '2m', target: 0 },
  ],
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
    sleep(Math.random() * 3 + 2);   // ← думает после входа

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
  sleep(Math.random() * 3 + 2);   

  // 6. Переход в Flights
  let flightsPage = http.get(`${BASE_URL}/cgi-bin/nav.pl?page=menu&in=flights`);
  check(flightsPage, { 'Flights page loaded': (r) => r.status === 200 });
   sleep(Math.random() * 4 + 3); 

  // 7. Поиск билетов
  const searchPayload = {
    advanceDiscount: '0',
    depart: 'Sydney',
    departDate: '12/26/2025',
    arrive: 'Portland',
    returnDate: '12/27/2025',
    numPassengers: '1',
    seatPref: 'None',
    seatType: 'Coach',
    '.cgifields': 'roundtrip',
    '.cgifields': 'seatType',
    '.cgifields': 'seatPref',
    'findFlights.x': '32',
    'findFlights.y': '10',
  };

  let resSearch = http.post(`${BASE_URL}/cgi-bin/reservations.pl`, searchPayload, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  check(resSearch, { 'Search success': (r) => r.status === 200 });
    sleep(Math.random() * 3 + 2); 
  // 8. Рандомный выбор рейса
  let flightMatches = [...resSearch.body.matchAll(/name="outboundFlight" value="([^"]+)"/g)];
  if (flightMatches.length === 0) throw new Error('No flights found');

  let availableFlights = flightMatches.map(m => m[1]);
  let randomIndex = Math.floor(Math.random() * availableFlights.length);
  let selectedFlight = availableFlights[randomIndex];
  console.log('Selected flight:', selectedFlight);

  // 9. Выбор рейса
  const reservePayload = {
    outboundFlight: selectedFlight,
    numPassengers: '1',
    advanceDiscount: '0',
    seatType: 'Coach',
    seatPref: 'None',
    'reserveFlights.x': '58',
    'reserveFlights.y': '4',
  };

  let resReserve = http.post(`${BASE_URL}/cgi-bin/reservations.pl`, reservePayload, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  check(resReserve, { 'Reserve success': (r) => r.status === 200 });
        sleep(Math.random() * 3 + 2); 


  // 10. Финальное бронирование
  const buyPayload = {
    firstName: randomString(5),
    lastName: randomString(5),
    address1: randomString(5),
    address2: randomString(5),
    pass1: randomString(5) + ' ' + randomString(5),
    creditCard: '',
    expDate: '',
    oldCCOption: '',
    numPassengers: '1',
    seatType: 'Coach',
    seatPref: 'None',
    outboundFlight: selectedFlight,
    advanceDiscount: '0',
    returnFlight: '',
    JSFormSubmit: 'off',
    'buyFlights.x': '50',
    'buyFlights.y': '9',
    '.cgifields': 'saveCC',
  };

  let resBuy = http.post(`${BASE_URL}/cgi-bin/reservations.pl`, buyPayload, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  check(resBuy, { 'Booking done': (r) => r.status === 200 && r.body.includes('Thank you for booking') });
    sleep(Math.random() * 3 + 2);   


  // Выход из системы
  let resLogout = http.get(`${BASE_URL}/cgi-bin/welcome.pl?signOff=1`);

  check(resLogout, {
    'Logout success': (r) => r.status === 200,
  });
        sleep(Math.random() * 3 + 2); 

  console.log('Logged out successfully');
  sleep(1);
}