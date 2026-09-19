let busy = false;
let modeSwitching = false;

const themeToggle = document.querySelector('#theme-toggle');
const themeLight = document.createElement('div');
themeLight.className = 'theme-light';
themeLight.setAttribute('aria-hidden', 'true');
document.body.append(themeLight);
let lightAnimation;
function toggleTheme() {
  const dark = document.documentElement.dataset.theme !== 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  themeToggle.setAttribute('aria-pressed', String(dark));
  themeToggle.setAttribute('aria-label', dark ? '切换浅色主题' : '切换深色主题');
  // 弧形明暗交界线模拟自转时的日落与日出，连续点击会取消上一段光影。
  if (lightAnimation) lightAnimation.cancel();
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    themeLight.classList.toggle('sunrise', !dark);
    lightAnimation = themeLight.animate([
      { transform: 'translateX(-100%) rotate(-18deg)', opacity: 0 },
      { opacity: 0.55, offset: 0.4 },
      { transform: 'translateX(100%) rotate(-18deg)', opacity: 0 },
    ], { duration: 1200, easing: 'cubic-bezier(.4,0,.2,1)' });
  }
}

async function switchMode(mode) {
  if (busy || modeSwitching) return;
  const card = document.querySelector('.card');
  const next = document.querySelector(`#${mode}-panel`);
  const previous = card.querySelector(':scope > div:not([hidden])');
  if (!next || next === previous) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const direction = mode === 'register' ? 1 : -1;
  const animations = [];
  modeSwitching = true;
  card.inert = true;
  const oldHeight = card.getBoundingClientRect().height;
  try {
    if (!reduceMotion) {
      const exit = previous.animate([
        { opacity: 1, transform: 'translateX(0)' },
        { opacity: 0, transform: `translateX(${-direction * 16}px)` },
      ], { duration: 140, easing: 'ease-in', fill: 'forwards' });
      animations.push(exit);
      await exit.finished;
    }
    previous.hidden = true;
    next.hidden = false;
    document.querySelectorAll('.error').forEach((error) => { error.textContent = ''; });
    document.querySelectorAll('input').forEach((input) => { input.removeAttribute('aria-invalid'); });
    if (!reduceMotion) {
      const newHeight = card.getBoundingClientRect().height;
      const resize = card.animate([
        { height: `${oldHeight}px` }, { height: `${newHeight}px` },
      ], { duration: 300, easing: 'cubic-bezier(.22,1,.36,1)' });
      const enter = next.animate([
        { opacity: 0, transform: `translateX(${direction * 16}px)` },
        { opacity: 1, transform: 'translateX(0)' },
      ], { duration: 300, easing: 'cubic-bezier(.22,1,.36,1)' });
      animations.push(resize, enter);
      await Promise.all([resize.finished, enter.finished]);
    }
  } finally {
    animations.forEach((animation) => animation.cancel());
    card.inert = false;
    modeSwitching = false;
    document.querySelector(`#${mode}-username`).focus({ preventScroll: true });
  }
}

function togglePassword(button) {
  const input = document.getElementById(button.getAttribute('aria-controls'));
  const visible = input.type === 'password';
  input.type = visible ? 'text' : 'password';
  button.setAttribute('aria-label', visible ? '隐藏密码' : '显示密码');
  button.setAttribute('aria-pressed', String(visible));
}

function validate(input) {
  let message = '';
  if (!input.value.trim()) {
    const requiredMessages = {
      username: '请输入账号',
      password: '请输入密码',
      confirm: '请再次输入密码',
    };
    message = requiredMessages[input.name] || '请输入密码';
  } else if (input.name === 'password' && new TextEncoder().encode(input.value).length > 72) {
    message = '密码最多 72 个 UTF-8 字节（一个汉字通常占 3 个字节）';
  } else if (input.name === 'confirm' && input.value !== input.form.elements.password.value) {
    message = '两次输入的密码不一致';
  }
  document.getElementById(`${input.id}-error`).textContent = message;
  input.setAttribute('aria-invalid', String(Boolean(message)));
  return !message;
}

async function submitForm(event) {
  const form = event.currentTarget;
  event.preventDefault();
  if (busy) return;
  const mode = form.id === 'register-form' ? 'register' : 'login';
  const username = form.elements.username.value.trim();
  if (mode === 'register' && username === 'ncuhome') {
    window.alert('你输入了什么奇怪的东西?!!(>_<)');
    window.location.assign('https://home.ncu.edu.cn/');
    return;
  }
  const inputs = [...form.querySelectorAll('input')];
  const checks = inputs.map(validate);
  if (checks.includes(false)) {
    inputs[checks.indexOf(false)].focus();
    return;
  }

  const password = form.elements.password.value;
  const submit = form.querySelector('[type="submit"]');
  const originalText = submit.textContent;
  busy = true;
  document.querySelectorAll('button, input').forEach((control) => { control.disabled = true; });
  submit.textContent = mode === 'register' ? '注册中…' : '登录中…';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`/api/${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      signal: controller.signal,
    });
    const result = await response.json();
    if (response.ok && mode === 'register') {
      form.reset();
      document.querySelector('#login-username').value = username;
      document.querySelector('#login-password').value = '';
    }
    if (response.ok) {
      form.elements.password.value = '';
      form.querySelectorAll('.eye').forEach((eye) => {
        document.getElementById(eye.getAttribute('aria-controls')).type = 'password';
        eye.setAttribute('aria-label', '显示密码');
        eye.setAttribute('aria-pressed', 'false');
      });
    }
    window.alert(result.message || '服务器未返回提示信息');
  } catch (error) {
    window.alert(error.name === 'AbortError' ? '请求超时，请稍后重试' : '无法连接服务，请确认 Go 服务正在运行后重试');
  } finally {
    clearTimeout(timeout);
    busy = false;
    document.querySelectorAll('button, input').forEach((control) => { control.disabled = false; });
    submit.textContent = originalText;
  }
}

function bindEvents() {
  themeToggle.addEventListener('click', toggleTheme);
  document.querySelectorAll('[data-mode]').forEach((button) => {
    button.addEventListener('click', () => switchMode(button.dataset.mode));
  });
  document.querySelectorAll('.eye').forEach((button) => {
    button.addEventListener('click', () => togglePassword(button));
  });
  document.querySelectorAll('input').forEach((input) => {
    input.addEventListener('blur', () => {
      // 空白输入框在提交前保持安静，已有错误则继续更新提示。
      if (input.value.trim() || input.getAttribute('aria-invalid') === 'true') validate(input);
    });
    input.addEventListener('input', () => {
      if (input.getAttribute('aria-invalid') === 'true') validate(input);
      const confirm = input.form.elements.confirm;
      if (input.name === 'password' && confirm && confirm.getAttribute('aria-invalid') === 'true') validate(confirm);
    });
  });
  document.querySelectorAll('form').forEach((form) => {
    form.addEventListener('submit', submitForm);
  });
}

bindEvents();
