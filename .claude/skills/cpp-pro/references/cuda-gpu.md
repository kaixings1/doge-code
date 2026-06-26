# CUDA and GPU Programming

Comprehensive guide to CUDA programming for GPU-accelerated computing, covering kernels, memory management, performance optimization, and multi-GPU development.

## CUDA Basics

### Kernel Functions

```cpp
#include <cuda_runtime.h>

__global__ void vector_add(const float* a, const float* b, float* c, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) {
        c[idx] = a[idx] + b[idx];
    }
}

// Invocation
int threads = 256;
int blocks = (n + threads - 1) / threads;
vector_add<<<blocks, threads>>>(d_a, d_b, d_c, n);
```

### Memory Management

```cpp
// Device memory allocation
float* d_data;
cudaMalloc(&d_data, size * sizeof(float));

// Host to Device
cudaMemcpy(d_data, h_data, size * sizeof(float), cudaMemcpyHostToDevice);

// Device to Host
cudaMemcpy(h_data, d_data, size * sizeof(float), cudaMemcpyDeviceToHost);

// Unified Memory (Pascal+)
cudaMallocManaged(&data, size * sizeof(float));
// Accessible from both CPU and GPU
```

### Memory Hierarchy

```cpp
// Global memory (slowest, largest)
__global__ void process_global(const float* __restrict__ input, 
                               float* __restrict__ output) {
    // Coalesced access for performance
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    output[idx] = input[idx] * 2.0f;
}

// Shared memory (fast, per-block)
__global__ void shared_memory_kernel(const float* input, 
                                     float* output, int n) {
    __shared__ float shared_data[256];
    
    int tid = threadIdx.x;
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    
    if (idx < n) {
        shared_data[tid] = input[idx];
    }
    __syncthreads();
    
    // Process shared data
    if (tid > 0 && tid < 255) {
        output[idx] = shared_data[tid] + shared_data[tid - 1];
    }
}

// Registers (fastest, limited per thread)
__device__ __forceinline__ float fast_sqrt(float x) {
    return sqrtf(x);  // Compiler will use fast math
}
```

## Thread Synchronization

```cpp
__global__ void parallel_reduce(float* data, float* result, int n) {
    __shared__ float sdata[256];
    
    int tid = threadIdx.x;
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    
    // Load into shared memory
    sdata[tid] = (idx < n) ? data[idx] : 0.0f;
    __syncthreads();
    
    // Parallel reduction
    for (int s = blockDim.x / 2; s > 0; s >>= 1) {
        if (tid < s) {
            sdata[tid] += sdata[tid + s];
        }
        __syncthreads();
    }
    
    // Write block result
    if (tid == 0) {
        atomicAdd(result, sdata[0]);
    }
}
```

## Warp Operations

```cpp
// Warp shuffle - exchange data without shared memory
__device__ __forceinline__ float warp_reduce_sum(float val) {
    for (int offset = warpSize / 2; offset > 0; offset >>= 1) {
        val += __shfl_down_sync(0xffffffff, val, offset);
    }
    return val;
}

// Warp vote functions
__global__ void count_positives(const float* data, int* count, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    int mask = __activemask();
    int leader = __match_any_sync(mask, idx / 1024);
    
    if (threadIdx.x % warpSize == 0) {
        atomicAdd(count, __popc(mask));
    }
}
```

## Cooperative Groups

```cpp
#include <cooperative_groups.h>

using namespace cooperative_groups;

__global__ void tiled_reduce(float* data, float* result, int n) {
    extern __shared__ float sdata[];
    
    cg::thread_block cta = cg::this_thread_block();
    cg::grid_group grid = cg::this_grid();
    
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    
    // Process element
    float sum = (idx < n) ? data[idx] : 0.0f;
    
    // Tile reduction
    cg::thread_block_tile<32> tile = cg::tiled_partition<32>(cta);
    
    for (int i = tile.size() / 2; i > 0; i >>= 1) {
        sum += tile.shfl_down(sum, i);
    }
    
    if (tile.thread_rank() == 0) {
        atomicAdd(result, sum);
    }
}

// Kernel launch with cooperative groups
void launch_cooperative() {
    void* args[] = {&d_data, &d_result, &n};
    cudaLaunchCooperativeKernel(
        (void*)tiled_reduce, grid_dim, block_dim,
        args, shared_mem, stream
    );
}
```

## Stream Parallelism

```cpp
// Multiple streams for overlap
cudaStream_t stream1, stream2;
cudaStreamCreate(&stream1);
cudaStreamCreate(&stream2);

// Kernel in stream 1
kernel1<<<blocks, threads, 0, stream1>>>(d_data1, d_result1);

// Kernel in stream 2 (runs concurrently)
kernel2<<<blocks, threads, 0, stream2>>>(d_data2, d_result2);

// Copy in stream 1
cudaMemcpyAsync(h_result1, d_result1, size, cudaMemcpyDeviceToHost, stream1);

// Synchronize
cudaStreamSynchronize(stream1);
cudaStreamSynchronize(stream2);

cudaStreamDestroy(stream1);
cudaStreamDestroy(stream2);
```

## cuBLAS Integration

```cpp
#include <cublas_v2.h>

cublasHandle_t handle;
cublasCreate(&handle);

// Matrix-vector product: y = alpha * A * x + beta * y
const float alpha = 1.0f;
const float beta = 0.0f;
cublasSgemv(handle, CUBLAS_OP_N, m, n, &alpha, 
            d_A, m, d_x, 1, &beta, d_y, 1);

// Matrix-matrix product: C = alpha * A * B + beta * C
cublasSgemm(handle, CUBLAS_OP_N, CUBLAS_OP_N, 
            m, n, k, &alpha, d_A, m, d_B, k, &beta, d_C, m);

cublasDestroy(handle);
```

## cuDNN for Deep Learning

```cpp
#include <cudnn.h>

cudnnHandle_t cudnn;
cudnnCreate(&cudnn);

// Convolution descriptor
cudnnConvolutionDescriptor_t conv_desc;
cudnnCreateConvolutionDescriptor(&conv_desc);
cudnnSetConvolution2dDescriptor(conv_desc,
    pad_h, pad_w, stride_h, stride_w, 1, 1, 
    CUDNN_CROSS_CORRELATION, CUDNN_DATA_FLOAT);

// Forward convolution
cudnnConvolutionForward(cudnn, &alpha, input_desc, d_input,
    weight_desc, d_weights, conv_desc, 
    CUDNN_CONVOLUTION_FWD_ALGO_IMPLICIT_PRECOMP_GEMM,
    work_space, work_space_size, &beta, output_desc, d_output);

cudnnDestroy(cudnn);
```

## Thrust Library

```cpp
#include <thrust/device_vector.h>
#include <thrust/transform.h>
#include <thrust/reduce.h>
#include <thrust/sort.h>

thrust::device_vector<float> d_vec(n);

// Transform (element-wise operation)
thrust::transform(d_vec.begin(), d_vec.end(), d_vec.begin(),
    thrust::placeholders::_1 * 2.0f);

// Reduction
float sum = thrust::reduce(d_vec.begin(), d_vec.end(), 0.0f, thrust::plus<float>());

// Sort
thrust::sort(d_vec.begin(), d_vec.end());

// Custom reduction with lambda
auto max_elem = thrust::reduce(d_vec.begin(), d_vec.end(), 
    -FLT_MAX, [] __device__ (float a, float b) { 
        return max(a, b); 
    });
```

## Performance Optimization

### Memory Coalescing

```cpp
// BAD: Non-coalesced access
__global__ void bad_kernel(float* data, int width) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    float val = data[threadIdx.x * width + blockIdx.x];  // Strided
}

// GOOD: Coalesced access
__global__ void good_kernel(float* data, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) {
        float val = data[idx];  // Sequential, coalesced
    }
}
```

### Bank Conflicts

```cpp
// BAD: Shared memory bank conflicts
__shared__ float sdata[256];
sdata[threadIdx.x] = value;
float other = sdata[(threadIdx.x + 1) & 255];  // Bank conflict

// GOOD: Padding to avoid conflicts
__shared__ float sdata[256 + 1];  // +1 padding
sdata[threadIdx.x] = value;
float other = sdata[(threadIdx.x + 1) % 256];
```

### Constant Cache

```cpp
// Use constant memory for read-only data
__constant__ float const_data[256];

__global__ void constant_kernel(float* output) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    output[idx] = const_data[idx % 256] * 2.0f;
}

// Host setup
cudaMemcpyToSymbol(const_data, h_data, sizeof(h_data));
```

## Multi-GPU Programming

```cpp
// Get device count
int device_count;
cudaGetDeviceCount(&device_count);

// Set device
cudaSetDevice(gpu_id);

// Peer access between GPUs
cudaDeviceEnablePeerAccess(other_device);

// Memory copy between GPUs
cudaMemcpy(d_data_remote, d_data_local, size, 
    cudaMemcpyDefault, stream);  // Uses peer access if available
```

### NVSHMEM (GPU-GPU Communication)

```cpp
#include <nvshmem.h>

// Initialize
nvshmem_init();
int my_pe = nvshmem_my_pe();
int n_pes = nvshmem_n_pes();

// Allocate symmetric memory
float* sdata = (float*)nvshmem_malloc(sizeof(float) * n);

// Collective barrier
nvshmem_barrier_all();

// Put data to remote PE
nvshmem_float_p(sdata, value, (my_pe + 1) % n_pes);

// Get data from remote PE
float val = nvshmem_float_g(sdata, (my_pe + 1) % n_pes);

nvshmem_finalize();
```

## CUDA Error Handling

```cpp
#define CUDA_CHECK(call) \
    do { \
        cudaError_t err = call; \
        if (err != cudaSuccess) { \
            fprintf(stderr, "CUDA error at %s:%d: %s\n", \
                __FILE__, __LINE__, cudaGetErrorString(err)); \
            exit(EXIT_FAILURE); \
        } \
    } while(0)

CUDA_CHECK(cudaMalloc(&d_data, size));
CUDA_CHECK(cudaMemcpy(d_data, h_data, size, cudaMemcpyHostToDevice));
CUDA_CHECK(cudaDeviceSynchronize());
```

## Profiling with Nsight

```cpp
// Nsight Systems
// nvnsys-cli ./program --trace=cuda,nvtx ./program

// Nsight Compute (kernel profiling)
// nv-nsight-cu-cli ./program

// Custom NVTX ranges
#include <nvtx3/nvtx3.h>

nvtx3::scoped_range range("my kernel");
nvtx3::scoped_range range1("phase 1", 0xFF0000FF);  // Red

// Markers
nvtx3::mark("checkpoint reached");
```

## Compute Capabilities

| Capability | GPUs | Features |
|------------|------|----------|
| 5.0 | Maxwell | Shared memory 48KB, atomic add |
| 6.0 | Pascal | Unified memory, page migration |
| 7.0 | Volta | Tensor cores, cooperative groups |
| 8.0 | Ampere | Sparse matrices, async copy |
| 9.0 | Hopper | Distributed shared memory, FP8 |

## Resources

- [CUDA C++ Programming Guide](https://docs.nvidia.com/cuda/cuda-c-programming-guide/)
- [cuBLAS Documentation](https://docs.nvidia.com/cuda/cublas/)
- [cuDNN Documentation](https://docs.nvidia.com/deeplearning/cudnn/)
- [Thrust Documentation](https://nvidia.github.io/thrust/)
- [Best Practices Guide](https://docs.nvidia.com/cuda/cuda-c-best-practices-guide/)
