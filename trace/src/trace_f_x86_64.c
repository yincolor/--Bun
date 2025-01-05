#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/types.h>
#include <sys/wait.h>
#include<signal.h>
#include <sys/ptrace.h>
#include <sys/user.h>
#include <sys/reg.h>
#include <asm/unistd.h>
#include <fcntl.h>


int main(int argc, char const *argv[])
{
    if (argc <= 1)
    {
        printf("【监听】必须有一个可执行文件做参数.\n");
        return -1;
    }

    const char *exec_path = argv[1];
    printf("【监听】启动程序：%s\n", exec_path);
    // printf("【父进程】long类型的长度是%lu字节\n", sizeof(long));
    pid_t pid = fork();
    if (pid < 0)
    {
        printf("【子进程配置】创建子进程失败\n");
        return -2;
    }

    if (pid == 0)
    {
        // 子进程
        ptrace(PTRACE_TRACEME, 0, NULL, NULL); // 设置允许父进程追踪的标志
        // printf("【子进程配置】配置可追踪\n");

        const int is_debug = 1;
        if (is_debug <= 0)
        {
            printf("【子进程配置】测试\n");
        }
        else
        {
            // printf("【子进程配置】重定向输出\n");
            int null_fd = open("/dev/null", O_WRONLY);
            if (null_fd == -1)
            {
                fprintf(stderr, "【子进程配置】无法访问 /dev/null 文件，请检查！\n");
                return -3;
            }
            if (dup2(null_fd, STDOUT_FILENO) == -1)
            {
                close(null_fd);
                fprintf(stderr, "【子进程配置】重定向子进程 stdout 到 /dev/null 失败\n");
                return -4;
            }
            if (dup2(null_fd, STDERR_FILENO) == -1)
            {
                close(null_fd);
                fprintf(stderr, "【子进程配置】重定向子进程 stderr 到 /dev/null 失败\n");
                return -5;
            }
            close(null_fd);
        }
        // printf("【子进程配置】启动程序\n"); 

        execl(exec_path, exec_path, NULL);
        printf("【子进程配置】如果程序正常启动，不会看到这行文本\n"); 
        return 0;
    }
    else
    {
        // 父进程 进入循环，监听子进程事件
        int child_process_status = -1;
        struct user_regs_struct regs;
        int flag = 0;
        while (1)
        {
            // printf("【监听进程】wait\n" );
            wait(&child_process_status);
            // printf("子进程状态数值：%d\n", child_process_status); 
            if (WIFEXITED(child_process_status))
            {
                int exit_code = WEXITSTATUS(child_process_status);
                printf("【监听】进程退出 %d\n", exit_code); 
                break;
            }else if(WIFSIGNALED(child_process_status)){
                int term_sig_code =  WTERMSIG(child_process_status); 
                printf("【监听】进程已死亡 %d\n", term_sig_code); 
                // break; 
                return -3;
            }else if(WIFSTOPPED(child_process_status)){
                int stop_sig_code = WSTOPSIG(child_process_status); 
                
                // printf("【监听进程】子进程被信号暂停，编号：%d\n", stop_sig_code); 
                if(stop_sig_code == SIGSEGV){
                    printf("【监听】进程异常 段错误\n"); 
                    kill(pid, SIGKILL); 
                    continue; 
                }else if(stop_sig_code == SIGTRAP){
                    // printf("【监听进程】子程序正常被PTRACE暂停，下面处理syscall\n");
                }
            }

            if (flag == 1)
            {
                ptrace(PTRACE_GETREGS, pid, NULL, &regs);
                int system_call_number = regs.orig_rax; // 获取子进程的系统调用编号
                // printf("子进程系统调用：%d\n", system_call_number);
                switch (system_call_number)
                {
                case __NR_open:
                    // printf("open\n");
                    break;
                case __NR_openat:
                    const int buffer_size = 64;
                    long *_path = malloc(sizeof(long) + buffer_size); // 存储返回数据
                    memset(_path, 0, buffer_size);
                    long bytes_read = 0; // 存储读取的位数
                    while (bytes_read < buffer_size - 1)
                    {
                        long data = ptrace(PTRACE_PEEKDATA, pid, regs.rsi + sizeof(long) * bytes_read, NULL);
                        // printf("获取返回的字节的值 0x%lX \n", data);
                        _path[bytes_read] = data;
                        bytes_read++;
                    }
                    _path[buffer_size - 1] = '\0';

                    // printf("【监听】__NR_openat 0x%llX 0x%llX 0x%llX , path %s\n", regs.rdi, regs.rsi, regs.rdx, (char *)_path);
                    printf("openat %s\n", (char *)_path);
                    free(_path);
                    _path = NULL;
                    break;
                default:
                    // printf("【主进程】调用了syscall，编号为：%d\n", system_call_number);
                    break;
                }
                flag = 0;
            }
            else
            {
                flag = 1;
            }
            ptrace(PTRACE_SYSCALL, pid, NULL, NULL); // 让子进程继续执行，主进程进入下一次wait
        }
    }

    return 0;
}
