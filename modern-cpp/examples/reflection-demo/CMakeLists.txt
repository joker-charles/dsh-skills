cmake_minimum_required(VERSION 3.30)   # CXX_STANDARD 26 needs CMake >= 3.30
project(reflection-demo LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 26)             # -> passes -std=c++26
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_executable(demo main.cpp)

# -freflection is a GNU extension flag: CMake never adds it for C++26,
# it must be listed explicitly.
target_compile_options(demo PRIVATE -freflection)
# Optional hardening/size flags (safe when the code uses neither):
#   target_compile_options(demo PRIVATE -fno-contracts -fno-exceptions -fno-rtti)

# Configure and build (GCC 16 is required for reflection/contracts/#embed;
# the default g++ is 15 and cannot even find <meta>):
#   cmake -S . -B build -DCMAKE_CXX_COMPILER=g++-16 -DCMAKE_BUILD_TYPE=Release
#   cmake --build build -j
#   ./build/demo
