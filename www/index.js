"use strict"; 

/** @type {HTMLButtonElement} */
const close_btn = document.querySelector("#close-btn");
/** @type {HTMLButtonElement} */
const start_btn = document.querySelector("#start-btn");
/** @type {HTMLInputElement} */
const exec_file_path_input = document.querySelector('#exec-file-path-input');
const ws = new WebSocket(window.location.href);

let server_is_close = false; 

ws.addEventListener('message', (ev)=>{
    const res = JSON.parse(ev.data);
    if(!res.action){
        console.log('ws 返回的请求，没有携带 action 参数', res);
        return;
    }
    switch(res.action){
        case 'exec-file-req':
            if(res?.success){
                console.log("启动程序成功");
            }else {
                console.log("启动程序失败");
                alert(res.error); 
            }
            break;
        case 'push-log':
            console.log("收到 ws 返回的push-log消息，将要更新内容");
            console.log(res);
            
            const log_container = document.querySelector('#log-container')
            const have_clean = log_container.getAttribute('have_clean');
            if(have_clean == true || have_clean == 'true'){
                log_container.innerHTML = "";
                log_container.setAttribute('have_clean', false); 
            }
            const str = res?.str;
            const p = document.createElement('p'); 
            p.innerText = str; 
            // const [text_color, bg_color] = getRandomColorGroup();
            // p.style.color = text_color; 
            // p.style.backgroundColor = bg_color; 
            log_container.append(p);
            log_container.scrollTo({
                behavior: "smooth",
                top: log_container.scrollHeight
            })
            break;
        case 'exe-over-end-push':
            document.querySelector('#log-container').setAttribute('have_clean', true); 
            break;
        case 'server-closed':
            alert("监听器服务端已退出"); 
            ws.close();
            server_is_close = true; 
            break; 
        default:
            console.log('ws 返回的请求，无效的 action 参数', res.action); 
            alert('ws收到无效的action：'+res.action); 
            break; 
    }
});

start_btn.addEventListener('click', (ev)=>{
    if(server_is_close){
        alert("程序的服务端已退出."); 
        return; 
    }
    // console.log(exec_file_path_input.value); 
    if(exec_file_path_input.value){
        ws.send(JSON.stringify({action: 'exec-file', file: exec_file_path_input.value})); 
    }
});

close_btn.addEventListener('click', ()=>{
    ws.send(JSON.stringify({ action: 'close' })); 
}); 
