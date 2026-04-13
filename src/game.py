import io
import pygame
import random
import sys

# 初始化 Pygame
pygame.init()

# 设置屏幕尺寸
SCREEN_WIDTH = 800
SCREEN_HEIGHT = 600

# 获取游戏标题（从当前文件中读取）
with io.open(__file__, 'r', encoding='utf-8') as f:
    game_title = f.read().split('\n')[2].strip()

screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
pygame.display.set_caption(game_title)
clock = pygame.time.Clock()
font = pygame.font.Font(r"C:\Windows\Fonts\arial.ttf", 24)

# 颜色
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
BLUE = (0, 150, 255)
RED = (255, 50, 50)
YELLOW = (255, 255, 0)
PURPLE = (150, 0, 255)

class Player(pygame.sprite.Sprite):
    def __init__(self):
        super().__init__()
        self.image = pygame.Surface((40, 50))
        self.image.fill(BLUE)
        # 画飞机形状
        pygame.draw.polygon(self.image, (0, 200, 255), [(20, 0), (0, 50), (40, 50)])
        self.rect = self.image.get_rect()
        self.rect.centerx = SCREEN_WIDTH // 2
        self.rect.bottom = SCREEN_HEIGHT - 50
        self.speed = 6
        self.bullets = pygame.sprite.Group()
        self.last_shot = 0
        self.shoot_delay = 150  # 毫秒

    def update(self):
        keys = pygame.key.get_pressed()
        if keys[pygame.K_LEFT] or keys[pygame.K_a]:
            self.rect.x -= self.speed
        if keys[pygame.K_RIGHT] or keys[pygame.K_d]:
            self.rect.x += self.speed
        if keys[pygame.K_UP] or keys[pygame.K_w]:
            self.rect.y -= self.speed
        if keys[pygame.K_DOWN] or keys[pygame.K_s]:
            self.rect.y += self.speed

        # 边界限制
        if self.rect.left < 0:
            self.rect.left = 0
        if self.rect.right > SCREEN_WIDTH:
            self.rect.right = SCREEN_WIDTH
        if self.rect.top < 0:
            self.rect.top = 0
        if self.rect.bottom > SCREEN_HEIGHT:
            self.rect.bottom = SCREEN_HEIGHT

        # 自动射击
        self.shoot()

    def shoot(self):
        now = pygame.time.get_ticks()
        if now - self.last_shot > self.shoot_delay:
            self.last_shot = now
            bullet = Bullet(self.rect.centerx - 5, self.rect.top)
            all_sprites.add(bullet)
            bullets.add(bullet)
            bullet = Bullet(self.rect.centerx + 5, self.rect.top)
            all_sprites.add(bullet)
            bullets.add(bullet)

class Bullet(pygame.sprite.Sprite):
    def __init__(self, x, y):
        super().__init__()
        self.image = pygame.Surface((4, 12))
        self.image.fill(YELLOW)
        self.rect = self.image.get_rect()
        self.rect.centerx = x
        self.rect.bottom = y
        self.speed = -10

    def update(self):
        self.rect.y += self.speed
        if self.rect.bottom < 0:
            self.kill()

class Enemy(pygame.sprite.Sprite):
    def __init__(self, x, y, enemy_type='small'):
        super().__init__()
        self.type = enemy_type

        if enemy_type == 'small':
            self.image = pygame.Surface((30, 30))
            self.image.fill(RED)
            self.hp = 1
        elif enemy_type == 'medium':
            self.image = pygame.Surface((40, 35))
            self.image.fill((255, 150, 0))
            self.hp = 2
        else:  # big
            self.image = pygame.Surface((50, 50))
            self.image.fill(PURPLE)
            self.hp = 3

        self.rect = self.image.get_rect()
        self.rect.centerx = x
        self.rect.y = y
        self.speed = random.randint(1, 3)
        self.last_shot = 0
        self.shoot_delay = 2000  # 敌人射击间隔
        self.direction = 1  # 1=向右，-1=向左，0=不动

    def update(self):
        self.rect.y += self.speed

        # 随机改变水平方向
        if random.random() < 0.02:
            self.direction = random.choice([-1, 1])
            self.rect.x += self.direction * 2

        # 边界检查
        if self.rect.left < 0:
            self.rect.left = 0
        if self.rect.right > SCREEN_WIDTH:
            self.rect.right = SCREEN_WIDTH

        # 超出屏幕移除
        if self.rect.top > SCREEN_HEIGHT:
            self.kill()

class EnemyBullet(pygame.sprite.Sprite):
    def __init__(self, x, y):
        super().__init__()
        self.image = pygame.Surface((8, 8))
        self.image.fill((255, 0, 255))
        pygame.draw.circle(self.image, (255, 0, 255), (4, 4), 4)
        self.rect = self.image.get_rect()
        self.rect.centerx = x
        self.rect.bottom = y
        self.speed = 5

    def update(self):
        self.rect.y += self.speed
        if self.rect.top > SCREEN_HEIGHT:
            self.kill()

class Star(pygame.sprite.Sprite):
    """背景星星"""
    def __init__(self):
        super().__init__()
        size = random.randint(1, 3)
        self.image = pygame.Surface((size, size))
        self.image.fill(WHITE)
        self.rect = self.image.get_rect()
        self.rect.x = random.randint(0, SCREEN_WIDTH)
        self.rect.y = random.randint(0, SCREEN_HEIGHT)
        self.speed = random.randint(1, 4)

    def update(self):
        self.rect.y += self.speed
        if self.rect.top > SCREEN_HEIGHT:
            self.rect.y = 0
            self.rect.x = random.randint(0, SCREEN_WIDTH)

# 精灵组
all_sprites = pygame.sprite.Group()
enemies = pygame.sprite.Group()
bullets = pygame.sprite.Group()
enemy_bullets = pygame.sprite.Group()
stars = pygame.sprite.Group()
player = pygame.sprite.Group()

# 创建玩家并添加到精灵组
player_sprite = Player()
all_sprites.add(player_sprite)
player.add(player_sprite)

# 创建背景星星
for _ in range(50):
    star = Star()
    all_sprites.add(star)
    stars.add(star)

# 游戏状态
score = 0
lives = 3
game_over = False
difficulty = 1

def spawn_enemy():
    """生成敌人"""
    if random.random() < 0.02 * difficulty:
        x = random.randint(30, SCREEN_WIDTH - 30)
        rand = random.random()
        if rand < 0.7:
            enemy_type = 'small'
        elif rand < 0.9:
            enemy_type = 'medium'
        else:
            enemy_type = 'big'

        enemy = Enemy(x, -40, enemy_type)
        all_sprites.add(enemy)
        enemies.add(enemy)

def draw_text(text, size, x, y, color=WHITE):
    """绘制文本"""
    font_obj = pygame.font.SysFont("arial", size)
    text_surface = font_obj.render(text, True, color)
    text_rect = text_surface.get_rect()
    text_rect.center = (x, y)
    screen.blit(text_surface, text_rect)

def draw_health_bar(x, y, hp, max_hp, width=40):
    """绘制血条"""
    if max_hp <= 1:
        return
    ratio = hp / max_hp
    pygame.draw.rect(screen, RED, (x - width//2, y - 35, width, 5))
    pygame.draw.rect(screen, (0, 255, 0), (x - width//2, y - 35, int(width * ratio), 5))

# 主循环
running = True
while running:
    clock.tick(60)

    # 事件处理
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        if event.type == pygame.KEYDOWN:
            if event.key == pygame.K_ESCAPE:
                running = False
            if event.key == pygame.K_r and game_over:
                # 重新开始
                game_over = False
                score = 0
                lives = 3
                difficulty = 1
                enemies.empty()
                bullets.empty()
                enemy_bullets.empty()
                player.rect.centerx = SCREEN_WIDTH // 2
                player.rect.bottom = SCREEN_HEIGHT - 50

    if not game_over:
        # 生成敌人
        spawn_enemy()

        # 更新
        all_sprites.update()

        # 碰撞检测 - 子弹 vs 敌人
        hits = pygame.sprite.groupcollide(enemies, bullets, False, True)
        for hit_enemy in hits:
            hit_enemy.hp -= 1
            if hit_enemy.hp <= 0:
                enemy_bullets.add(EnemyBullet(hit_enemy.rect.centerx, hit_enemy.rect.bottom))

        # 碰撞检测 - 玩家 vs 敌人
        hits = pygame.sprite.groupcollide(player, enemies, False, True)
        for hit_enemy in hits:
            lives -= 1
            if lives <= 0:
                game_over = True

    # 绘制
    screen.fill(BLACK)

    # 绘制飞机（玩家）
    for p_sprite in player.sprites():
        screen.blit(p_sprite.image, p_sprite.rect)

    # 绘制敌人
    for enemy in enemies:
        screen.blit(enemy.image, enemy.rect)

    # 绘制子弹
    for bullet in bullets:
        screen.blit(bullet.image, bullet.rect)

    for enemy_bullet in enemy_bullets:
        screen.blit(enemy_bullet.image, enemy_bullet.rect)

    # 绘制星星
    for star in stars:
        screen.blit(star.image, star.rect)

    # 绘制分数和血条
    draw_text(f"分数: {score}", 24, SCREEN_WIDTH - 80, 10)
    draw_health_bar(SCREEN_WIDTH - 200, 20, lives, 3, width=40)

    # 显示游戏结束提示
    if game_over:
        font_big = pygame.font.SysFont("arial", 60)
        game_over_text = font_big.render("游戏结束", True, RED)
        screen.blit(game_over_text, (SCREEN_WIDTH // 2 - 150, SCREEN_HEIGHT // 2))

    # 更新显示
    pygame.display.flip()


def main():
    """游戏主函数"""
    pass  # 由 main.py 入口调用


if __name__ == "__main__":
    main()