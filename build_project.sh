gcc ./trace/src/trace_f_x86_64.c -o trace/trace_f_x86_64
bun build --compile ./index.js --outfile ./build/file_tracer_linux_x86_64
cp -rf ./www/ ./build/
cp -rf ./trace/ ./build/ 
cp -rf ./测试程序/ ./build/
