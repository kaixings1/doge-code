const http = require('http');
const server = require('./server.js');

describe('Hello World Server', () => {
  beforeAll((done) => {
    // 若服务器已处于监听状态，先关闭再重新监听，避免重复调用触发报错
    if (server.listening) {
      server.close(() => {
        server.listen(3000, done);
      });
    } else {
      server.listen(3000, done);
    }
  });
  afterAll((done) => {
    server.close(done);
  });

  it('should return Hello World with status 200', (done) => {
    http.get('http://localhost:3000', (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        expect(res.statusCode).toBe(200);
        expect(data).toBe('Hello World');
        done();
      });
    }).on('error', done);
  });
});
