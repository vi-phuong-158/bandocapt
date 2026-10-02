'use strict';
const net = require('node:net');

function redisCommand(args) {
    return new Promise((resolve, reject) => {
        const socket = net.createConnection({ host: '127.0.0.1', port: Number(process.env.ZALO_TEST_REDIS_PORT) });
        let pending = Buffer.alloc(0);
        const finish = (error, value) => { socket.destroy(); error ? reject(error) : resolve(value); };
        socket.setTimeout(5000, () => finish(new Error('REDIS_TEST_TIMEOUT')));
        socket.on('error', reject);
        socket.on('connect', () => socket.write(`*${args.length}\r\n` + args.map(arg => `$${Buffer.byteLength(String(arg))}\r\n${arg}\r\n`).join('')));
        socket.on('data', data => {
            pending = Buffer.concat([pending, data]);
            const end = pending.indexOf('\r\n');
            if (end < 0) return;
            const header = pending.subarray(1, end).toString();
            const type = pending[0];
            if (type === 45) return finish(new Error(header));
            if (type === 43) return finish(null, header);
            if (type === 58) return finish(null, Number(header));
            if (type === 36) {
                const length = Number(header);
                if (length === -1) return finish(null, null);
                if (pending.length >= end + 2 + length + 2) finish(null, pending.subarray(end + 2, end + 2 + length).toString());
            }
        });
    });
}


module.exports = { redisCommand };
