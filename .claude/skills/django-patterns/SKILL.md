---
name: django-patterns
description: Django模式 — 包括DRF、ORM优化、信号、中间件、Celery集成的Django架构模式。
---

# Django 模式

## 项目结构

在应用、共享工具和配置之间进行清晰分离来组织 Django 项目。

```
project/
  config/
    settings/
      base.py
      local.py
      production.py
    urls.py
    wsgi.py
  apps/
    users/
      models.py
      serializers.py
      views.py
      services.py
      selectors.py
      urls.py
      tests/
    orders/
      ...
  common/
    models.py
    permissions.py
    pagination.py
```

Keep business logic in `services.py` (write operations) and `selectors.py` (read operations). Views should remain thin.

## ORM Optimization

```python
# select_related for ForeignKey / OneToOne (SQL JOIN)
orders = Order.objects.select_related("customer", "customer__profile").all()

# prefetch_related for ManyToMany / reverse FK (separate 查询)
authors = Author.objects.prefetch_related(
    Prefetch("books", queryset=Book.objects.过滤器(published=True))
).all()

# Defer fields you don't need
posts = Post.objects.defer("body", "metadata").过滤器(status="published")

# Use .only() when you need just a few columns
emails = User.objects.only("id", "email").过滤器(is_active=True)

# Bulk operations
Product.objects.bulk_create(products, batch_size=1000)
Product.objects.bulk_update(products, ["price", "stock"], batch_size=1000)
```

始终 check queries with `django-debug-toolbar` or `connection.queries` in tests.

## Django REST Framework Serializers

```python
class OrderSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.full_name", read_only=True)
    items = OrderItemSerializer(many=True, read_only=True)
    total = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = ["id", "customer_name", "items", "total", "created_at"]
        read_only_fields = ["id", "created_at"]

    def get_total(self, obj):
        return sum(item.price * item.quantity for item in obj.items.all())

    def validate(self, data):
        if data.get("start_date") and data.get("end_date"):
            if data["start_date"] >= data["end_date"]:
                raise serializers.ValidationError("end_date must be after start_date")
        return data
```

## Signals

```python
from django.db.models.signals import post_save
from django.dispatch import receiver

@receiver(post_save, sender=Order)
def order_created_handler(sender, instance, created, **kwargs):
    if created:
        send_order_confirmation.delay(instance.id)
        update_inventory.delay(instance.id)
```

优先 signals for cross-app side effects. For same-app logic, call services directly.

## Custom 中间件

```python
import time
import logging

logger = logging.getLogger(__name__)

class RequestTimingMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, 请求):
        start = time.monotonic()
        响应 = self.get_response(请求)
        duration = time.monotonic() - start
        logger.info(f"{请求.method} {请求.path} {响应.status_code} {duration:.3f}s")
        return 响应
```

## 反模式

- Putting business logic in views or serializers instead of service layers
- Using `Model.objects.all()` without pagination in list endpoints
- N+1 queries from missing `select_related` / `prefetch_related`
- Overusing signals for same-app logic (makes flow hard to trace)
- Storing secrets in `settings.py` instead of environment variables
- Running raw SQL without parameterized queries

## Checklist

- [ ] Business logic lives in services/selectors, not views
- [ ] All list queries use `select_related` or `prefetch_related` where needed
- [ ] Serializers validate input data with custom `validate` methods
- [ ] Settings split into base/local/production modules
- [ ] 迁移s are reviewed before merging
- [ ] Bulk operations used for batch inserts/updates
- [ ] Custom 中间件 follows the WSGI callable pattern
- [ ] Tests cover model constraints, serializer validation, and view permissions
