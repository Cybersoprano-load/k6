import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

function randomString(length = 8) {
  return Math.random().toString(36).substring(2, 2 + length);
}
export let options = {
  vus: 10,
  iterations: 10,
};

// CSV
const users = new SharedArray('users', function () {
  return open('./users.csv')
    .split('\n')
    .slice(1)                // убираем заголовок
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      const [username, password] = line.split(',');
      return { username, password };
    });
});

export default function () {

  const BASE_URL = 'http://webtours.load-test.ru:1080';

  // пользователь из CSV
  const user = users[(__VU - 1) % users.length];
  const username = user.username;
  const password = user.password;

  console.log(`REGISTER USER -> ${username} / ${password}`);

  // переход на страницу
  let resGet = http.get(
    `${BASE_URL}/cgi-bin/login.pl?getInfo=true`
  );

  check(resGet, {
    'GET login.pl OK': (r) => r.status === 200,
  });

  // регистрация
  let registerPayload = {
    username: username,
    password: password,
    passwordConfirm: password,
    firstName: `${randomString(5)}`,
    lastName: `${randomString(5)}`,
    address1: `${randomString(5)}`,
    address2: `${randomString(5)}`,
    'register.x': '50',
    'register.y': '10',
  };

  let resRegister = http.post(
    `${BASE_URL}/cgi-bin/login.pl`,
    registerPayload,
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: '10s',
    }
  );

  check(resRegister, {
    'REGISTER OK': (r) =>
      r.status === 200 &&
      r.body.includes('Thank you'),
  });

  sleep(1);
}
