
cmake_minimum_required(VERSION 3.21)
project(hello C CXX)
add_executable(hello hello.c)
file(WRITE cmake_config.json "{\"CMAKE_C_COMPILER_ID\":\"${CMAKE_C_COMPILER_ID}\",\"CMAKE_HOST_SYSTEM_NAME\":\"${CMAKE_HOST_SYSTEM_NAME}\",\"CMAKE_SYSTEM_PROCESSOR\":\"${CMAKE_SYTEM_PROCESSOR}\"}\n")
