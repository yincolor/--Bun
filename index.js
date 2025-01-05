"use strict";
import path from "node:path";
const ip = '127.0.0.1';
const http_server = Bun.serve({
    port: 0,
    hostname: ip,
    fetch: (req, server) => {
        if (server.upgrade(req)) {
            return;
        }
        const url = new URL(req.url);
        // console.log(`[http-server] get request: ${url.pathname}`);
        if (url.pathname == '/') {
            return new Response(Bun.file('www/index.html'));
        } else {
            return new Response(Bun.file('www/' + url.pathname));
        }
    },
    websocket: {
        message: websocketMsgHandler
    },
});

let trace_process = null;

/**
 * 处理 websocket 请求
 * @param {ServerWebSocket<any>} ws 
 * @param {string} msg 
 */
async function websocketMsgHandler(ws, msg) {
    const res = JSON.parse(msg);
    if (res?.action) {
        // console.log(`[websocket] get action: ${res.action}`);
        switch (res.action) {
            case "exec-file":
                if (Bun.which('strace') == null) {
                    ws.send(JSON.stringify({ action: 'exec-file-req', success: false, error: '本机似乎并未安装 strace 命令，请安装后重试' }));
                    return;
                }
                const exec_file_path = res.file;
                // const is_exec = await test_file_is_exe(exec_file_path)
                const is_exec = Bun.which(exec_file_path);
                if (is_exec) {
                    console.log(`[websocketMsgHandler] 启动进程 ${exec_file_path}`);
                    if (trace_process && trace_process.kill) {
                        trace_process.kill();
                        trace_process = null;
                    }
                    trace_process = Bun.spawn( {
                        // cmd: [path.resolve(__dirname, './strace'), ' -e trace=file ', exec_file_path],
                        cmd: [ path.resolve(__dirname, './trace/trace_f_x86_64'), exec_file_path], 
                        cwd: path.resolve(__dirname, './trace/cwd/'),
                        stdout: 'pipe',
                        stderr: 'pipe'
                    });
                    // console.log(`[websocketMsgHandler] 配置读取进程输出`);
                    const stdout_reader = trace_process.stdout.getReader();
                    // console.log('[websocketMsgHandler] 正在读取数据');
                    await readUTF8Stream(stdout_reader, async (str) => {
                        // 发送文本数据
                        ws.send(JSON.stringify({ action: 'push-log', str: str }));
                        // console.log(`[websocketMsgHandler] 发送 ${str.length} 个字符`); 
                    }, async () => {
                        // 处理程序运行结束的逻辑
                        // console.log('[websocketMsgHandler] 监听结束');
                        ws.send(JSON.stringify({ action: 'exe-over-end-push' }));
                        if (trace_process && trace_process.kill) {
                            trace_process.kill();
                            trace_process = null;
                        }
                    });
                } else {
                    // console.log('[websocketMsgHandler] 启动程序失败');
                    ws.send(JSON.stringify({ action: 'exec-file-req', success: false, error: `无法启动程序：${exec_file_path}` }));
                }
                break;
            case "close":
                ws.send(JSON.stringify({ action: 'server-closed' }));
                closeAllServer();
                break;
            default:
                console.log(`[websocket] unknow action: ${res.action}`);
                break;
        }
    } else {
        console.log(`[websocket] ws request dont have action param.`);
    }
}

/** 测试是否为可执行文件 */
async function test_file_is_exe(file_path) {
    const proc = Bun.spawn({ cmd: ['file', file_path], stdout: 'pipe' });
    const text = await new Response(proc.stdout).text();
    // const which_path = Bun.which(file_path)
    if (text && text.indexOf('ELF 64-bit') > 0) {
        // console.log(`[main] 确认为可执行文件 ${file_path}`);
        // console.log(`[main] 文件信息: ${text}`);
        return true;
    } else {
        // console.log(`[main] 无效的文件 ${file_path}`);
        return false;
    }
}
/** 读取Utf8编码的文本数据流，并调用回调函数*/
async function readUTF8Stream(reader, onRead, onEnd) {
    /** @type {Uint8Array} */
    let cache_buffer = new Uint8Array(0); // 缓存, 初始为0长度的
    const utf8_decoder = new TextDecoder();
    while (true) {
        const { value, done } = await reader.read();
        const new_buffer = new Uint8Array(value);
        const concat_buffer = concatUint8Array(cache_buffer, new_buffer); // 和之前缓存的数据合并
        let last_new_line_index = -1;
        for (let i = concat_buffer.length - 1; i >= 0; i--) {
            if (concat_buffer[i] == 10) {
                // 找到最后一个 换行符的位置
                last_new_line_index = i;
                break;
            }
        }
        if (last_new_line_index > 0) {
            // 找到了完整的一段文本数据
            const first_buffer = concat_buffer.subarray(0, last_new_line_index);
            const second_buffer = concat_buffer.subarray(last_new_line_index + 1);
            const str = utf8_decoder.decode(first_buffer);
            cache_buffer = second_buffer; // 将没有被使用的数据存入缓存 
            await onRead(str); // 调用回调 
        } else {
            // 没有找到完整的文本数据，还是需要等待下次读取、合并
            cache_buffer = concat_buffer;
        }
        if (done) {
            console.log('[readUTF8Stream] 完成读取');
            break;
        }
    }
    if (cache_buffer.length > 0) {
        await onRead(utf8_decoder.decode(cache_buffer));
    }
    if (onEnd) {
        await onEnd();
    }
}
/**
 * 合并2个Uint8Array项，并返回一个新的UInt8Array对象
 * @param {Uint8Array} first_arr 
 * @param {Uint8Array} second_arr 
 */
function concatUint8Array(first_arr, second_arr) {
    const res_buffer = new Uint8Array(first_arr.length + second_arr.length);
    res_buffer.set(first_arr, 0);
    res_buffer.set(second_arr, first_arr.length);
    return res_buffer;
}

/** 关闭全部服务 */
function closeAllServer() {
    http_server.stop();
    console.log('[main] http服务已关闭');
    if (trace_process && trace_process.kill) {
        trace_process.kill();
        trace_process = null;
    }
}

const port = http_server.port;
console.log(`[main] HTTP 服务端创建完毕 http://${ip}:${port}`);

Bun.spawn(['xdg-open', `http://${ip}:${port}`]); 