# ADK 测试风格指南

## 核心原则

- **通过公共接口测试** —— 调用用户调用的东西，断言用户看到的东西。
- **测试行为，而非实现** —— 验证结果（输出、副作用、错误），而非内部机制。
- **抗重构** —— 如果内部重构保持了相同行为，所有测试都应仍然通过。

## 规则

### 1. 测试名描述行为，而非机制

```python
# 好 —— 描述调用者能观察到的东西
def test_empty_queue_returns_none():
def test_retry_stops_after_max_attempts():
def test_missing_key_raises_key_error():

# 差 —— 描述的是实现细节
def test_deque_popleft_called():
def test_retry_counter_incremented():
def test_dict_getitem_raises():
```

### 2. Docstring：一行摘要，然后是 setup/act/assert

第一行从调用者视角描述预期行为。对于复杂测试（多步骤、多次调用），随后给出 Setup、Act、Assert 的结构化分解。

```python
# 好 —— 简单测试，一行就够了
"""从空缓存获取会返回默认值。"""

# 好 —— 带结构化分解的复杂测试
"""部分 FR 会重跑嵌套的 Workflow，已解决的子节点正常完成
而未解决的保持中断。

Setup: outer_wf → inner_wf → (child_a, child_b) → join.
  两个子节点在首次运行时都会中断。
Act:
  - 第 2 次运行：只解决 child_a 的 FR。
  - 第 3 次运行：解决 child_b 的 FR。
Assert:
  - 第 2 次运行：child_a 产出输出，invocation 仍处于中断状态。
  - 第 3 次运行：child_b 产出输出，join 完成，没有中断。
"""

# 差 —— 复述了实现
"""键缺失时 LRUCache._store.get 返回哨兵值。"""
"""在 submit() 中检查 ThreadPool._accept_tasks 标志。"""
```

### 3. 每个测试覆盖一个行为

如果测试检查了多个不相关行为，就拆分它。如果你无法用一句话描述测试，那它测得太多了。

```python
# 差 —— 在一个测试里同时测试容量、淘汰和默认值
def test_cache_behavior():
    assert cache.size == 0
    assert cache.get('x') is None
    cache.put('a', 1)
    assert cache.size == 1

# 好 —— 拆分成聚焦的测试
def test_new_cache_is_empty():
    """新建的缓存没有任何条目。"""

def test_cache_evicts_oldest_when_full():
    """向已满的缓存添加条目会移除最近最少使用的条目。"""
```

### 4. 不要测试内部状态

```python
# 差 —— 直接伸手读私有属性
assert pool._workers[0].is_alive
assert parser._state == 'HEADER'
assert isinstance(router._handler, _FastHandler)

# 好 —— 通过公共接口测试
assert pool.active_count == 1
assert parser.parse('data') == expected
assert router.route('/api') == handler
```

### 5. 使用真实组件，只 mock 边界

ADK 测试应尽可能使用真实实现，而不是 mock。

- Mock 外部依赖：LLM API、云服务、会话存储
- 使用真实 ADK 组件：BaseNode 子类、Event、Context
- 测试 NodeRunner 时 mock InvocationContext（它是边界）

### 6. 测试夹具应最小化

定义能触发该行为的最简 setup：

```python
# 好 —— 最小夹具，一个用途
def make_user(role='viewer'):
    return User(name='test', email='t@t.com', role=role)

# 差 —— 大杂烩式夹具，夹带无关的 setup
def make_full_test_env():
    db = create_database()
    user = create_user_with_billing()
    setup_notifications()
    ...
```

### 7. 让 arrange 逻辑靠近测试

当某个辅助类或夹具只被一个测试使用时，把它内联定义在测试函数内部。这让 setup 在使用点可见，避免滚动到远处模块级的定义。只有当 3 个以上测试共享同一辅助函数时才提取到模块级。

```python
# 好 —— 辅助类内联定义，紧挨着测试
@pytest.mark.asyncio
async def test_state_delta_bundled_with_output():
    """在 yield 之前设置的状态会被刷到输出事件上。"""

    class _Node(BaseNode):
        async def _run_impl(self, *, ctx, node_input):
            ctx.state['color'] = 'blue'
            yield 'result'

    ctx, events = _make_ctx()

    await NodeRunner(node=_Node(name='n'), parent_ctx=ctx).run()

    assert events[0].output == 'result'
    assert events[0].actions.state_delta['color'] == 'blue'

# 差 —— 辅助类定义在 300 行之前，读者必须来回滚动
class _StateThenOutputNode(BaseNode):
    async def _run_impl(self, *, ctx, node_input):
        ctx.state['color'] = 'blue'
        yield 'result'

# ... 300 行之后 ...
async def test_state_delta_bundled_with_output():
    node = _StateThenOutputNode(name='n')
    ...
```

### 8. 断言讲述一个故事

```python
# 好 —— 读起来像一份规格说明
assert queue.size == 0
assert config.get('timeout') == 30
assert response.status_code == 404

# 差 —— 防御过度，测的是框架行为
assert isinstance(queue, Queue)
assert hasattr(config, 'get')
assert len(response.headers) > 0
```

### 9. 把测试组织为 arrange、act、assert

每个测试有三个独立步骤：

- **Arrange** —— 设置该场景专属的外部状态。多个测试共享的通用 setup 属于夹具。
- **Act** —— 调用被测系统。通常是一次调用。
- **Assert** —— 验证返回值或可见状态变更。此处不再对被测系统发起进一步调用。

保持步骤分明。用空行分隔。在每个步骤只有单条语句的简单测试中，空行可省略。在复杂测试中，使用描述性注释如 "给定 [场景]"、"当 [动作]"、"然后 [预期]" —— 避免添加不了信息的裸标签。

```python
# 好 —— 清晰的视觉分隔
def test_cache_returns_stored_value():
    cache = Cache()
    cache.put('key', 'value')

    result = cache.get('key')

    assert result == 'value'

# 好 —— 简单测试，省略空行
def test_new_cache_is_empty():
    assert Cache().size == 0

# 差 —— 步骤交错在一起
def test_cache_behavior():
    cache = Cache()
    cache.put('key', 'value')
    result = cache.get('key')
    assert result == 'value'
    cache.put('key2', 'value2')  # 断言之后还在继续 setup
    assert cache.size == 2
```

### 测试结构模板

```python
"""<ComponentName> 的测试。

验证 <component> 能正确实现 <high-level behavior>。
"""

# --- 夹具（最小化，每个只服务一个用途） ---

def _make_service():
    ...

# --- 测试（每个测试覆盖一个行为） ---

def test_<behavior_description>():
    """<One sentence: what the system does from the outside.>"""
    # 给定一个使用默认配置的服务
    service = _make_service()
    input_data = 'hello'

    # 当该操作被执行时
    result = service.do_something(input_data)

    # 然后结果符合预期
    assert result == expected
```
