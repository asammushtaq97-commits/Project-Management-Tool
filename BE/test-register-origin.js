(async () => {
  try {
    const email = `edge_${Date.now()}@example.com`;
    const body = { name: 'Edge Test', email, password: 'Secret123' };

    const res = await fetch('http://localhost:4000/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:5179',
      },
      body: JSON.stringify(body),
    });

    console.log('status', res.status);
    const headers = {};
    for (const [k, v] of res.headers.entries()) headers[k] = v;
    console.log('headers', headers);
    const text = await res.text();
    console.log('body', text);
  } catch (err) {
    console.error('error', err);
    process.exit(1);
  }
})();
