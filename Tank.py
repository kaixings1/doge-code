"""
坦克大战 - Python Pygame 实现
约 380 行，功能完整：
- 玩家坦克（WASD移动，空格射击）
- 敌方坦克（简单AI，随机移动/射击）
- 可破坏砖墙
- 不可破坏钢墙（围绕基地）
- 基地（被击中则游戏结束）
- 碰撞检测（坦克之间、坦克与墙、子弹与墙）
- 生命值、胜负判定
"""

import pygame
import random
import sys

# 初始化
pygame.init()

# 常量
SCREEN_WIDTH = 800
SCREEN_HEIGHT = 600
FPS = 60

# 颜色
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
GREEN = (0, 255, 0)
RED = (255, 0, 0)
BLUE = (0, 0, 255)
YELLOW = (255, 255, 0)
BROWN = (139, 69, 19)
GRAY = (128, 128, 128)
DARK_GRAY = (64, 64, 64)

# 方向
UP, DOWN, LEFT, RIGHT = 0, 1, 2, 3

# 游戏状态
STATE_PLAYING, STATE_GAME_OVER, STATE_VICTORY = 0, 1, 2

# 设置窗口
screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
pygame.display.set_caption("坦克大战")
clock = pygame.time.Clock()
font = pygame.font.Font(None, 36)

class Wall:
    """墙壁类，支持砖墙（可破坏）和钢墙（不可破坏）"""
    def __init__(self, x, y, destructible=True):
        self.rect = pygame.Rect(x, y, 40, 40)
        self.destructible = destructible
        self.active = True
        self.color = BROWN if destructible else GRAY

    def draw(self, surface):
        if self.active:
            pygame.draw.rect(surface, self.color, self.rect)
            if not self.destructible:
                # 钢墙加个边框效果
                pygame.draw.rect(surface, DARK_GRAY, self.rect, 2)

class Bullet:
    """子弹类"""
    def __init__(self, tank, direction):
        self.speed = 8
        self.direction = direction
        self.radius = 4
        self.life = 120  # 帧数后消失
        # 从坦克中心发射
        center_x = tank.x + tank.width // 2
        center_y = tank.y + tank.height // 2
        if direction == UP:
            self.x, self.y = center_x - self.radius, tank.y
        elif direction == DOWN:
            self.x, self.y = center_x - self.radius, tank.y + tank.height
        elif direction == LEFT:
            self.x, self.y = tank.x, center_y - self.radius
        else:  # RIGHT
            self.x, self.y = tank.x + tank.width, center_y - self.radius
        self.rect = pygame.Rect(self.x, self.y, self.radius*2, self.radius*2)

    def update(self):
        if self.direction == UP:
            self.rect.y -= self.speed
        elif self.direction == DOWN:
            self.rect.y += self.speed
        elif self.direction == LEFT:
            self.rect.x -= self.speed
        else:
            self.rect.x += self.speed
        self.life -= 1

    def draw(self, surface):
        pygame.draw.circle(surface, YELLOW, self.rect.center, self.radius)

class Tank:
    """坦克基类"""
    def __init__(self, x, y, color, speed):
        self.x = x
        self.y = y
        self.width = 40
        self.height = 40
        self.color = color
        self.speed = speed
        self.direction = UP
        self.bullets = []
        self.cooldown = 0
        self.cooldown_max = 20
        self.alive = True

    def get_rect(self):
        return pygame.Rect(self.x, self.y, self.width, self.height)

    def move(self, dx, dy, walls, tanks):
        if not self.alive:
            return
        new_x = self.x + dx
        new_y = self.y + dy
        temp_rect = pygame.Rect(new_x, new_y, self.width, self.height)

        # 边界
        if temp_rect.left < 0 or temp_rect.right > SCREEN_WIDTH or temp_rect.top < 0 or temp_rect.bottom > SCREEN_HEIGHT:
            return

        # 墙壁碰撞
        for wall in walls:
            if wall.active and temp_rect.colliderect(wall.rect):
                return

        # 坦克碰撞（排除自己）
        for tank in tanks:
            if tank != self and tank.alive and temp_rect.colliderect(tank.get_rect()):
                return

        self.x, self.y = new_x, new_y

    def shoot(self):
        if self.cooldown <= 0 and self.alive:
            self.bullets.append(Bullet(self, self.direction))
            self.cooldown = self.cooldown_max

    def update_bullets(self, walls, enemy_tanks, player, base):
        """更新子弹状态，处理碰撞"""
        if self.cooldown > 0:
            self.cooldown -= 1

        for bullet in self.bullets[:]:
            bullet.update()

            # 墙壁碰撞
            hit_wall = False
            for wall in walls:
                if wall.active and bullet.rect.colliderect(wall.rect):
                    if wall.destructible:
                        wall.active = False
                    hit_wall = True
                    break
            if hit_wall:
                self.bullets.remove(bullet)
                continue

            # 边界
            if bullet.rect.right < 0 or bullet.rect.left > SCREEN_WIDTH or bullet.rect.bottom < 0 or bullet.rect.top > SCREEN_HEIGHT:
                self.bullets.remove(bullet)
                continue

            # 子弹生命周期
            if bullet.life <= 0:
                self.bullets.remove(bullet)
                continue

            # 碰撞检测：玩家子弹打敌人，敌人子弹打玩家或基地
            if isinstance(self, PlayerTank):
                for enemy in enemy_tanks:
                    if enemy.alive and bullet.rect.colliderect(enemy.get_rect()):
                        enemy.alive = False
                        self.bullets.remove(bullet)
                        break
            elif isinstance(self, EnemyTank):
                if player.alive and bullet.rect.colliderect(player.get_rect()):
                    player.alive = False
                    self.bullets.remove(bullet)
                    continue
                if base.alive and bullet.rect.colliderect(base.rect):
                    base.alive = False
                    self.bullets.remove(bullet)
                    continue

    def draw(self, surface):
        if not self.alive:
            return
        # 坦克主体
        pygame.draw.rect(surface, self.color, self.get_rect())
        pygame.draw.rect(surface, BLACK, self.get_rect(), 2)
        # 炮管
        cx, cy = self.x + self.width//2, self.y + self.height//2
        if self.direction == UP:
            ex, ey = cx, cy - 20
        elif self.direction == DOWN:
            ex, ey = cx, cy + 20
        elif self.direction == LEFT:
            ex, ey = cx - 20, cy
        else:
            ex, ey = cx + 20, cy
        pygame.draw.line(surface, BLACK, (cx, cy), (ex, ey), 5)
        # 子弹
        for bullet in self.bullets:
            bullet.draw(surface)

class PlayerTank(Tank):
    def __init__(self, x, y):
        super().__init__(x, y, GREEN, 4)
        self.lives = 3
        self.respawn_timer = 0

    def handle_input(self, keys, walls, all_tanks):
        if not self.alive:
            return
        dx = dy = 0
        if keys[pygame.K_w] or keys[pygame.K_UP]:
            self.direction = UP
            dy = -self.speed
        elif keys[pygame.K_s] or keys[pygame.K_DOWN]:
            self.direction = DOWN
            dy = self.speed
        elif keys[pygame.K_a] or keys[pygame.K_LEFT]:
            self.direction = LEFT
            dx = -self.speed
        elif keys[pygame.K_d] or keys[pygame.K_RIGHT]:
            self.direction = RIGHT
            dx = self.speed

        if dx != 0 or dy != 0:
            self.move(dx, dy, walls, all_tanks)

        if keys[pygame.K_SPACE]:
            self.shoot()

class EnemyTank(Tank):
    def __init__(self, x, y):
        super().__init__(x, y, RED, 2)
        self.ai_timer = 0
        self.change_dir_time = random.randint(40, 100)
        self.shoot_prob = 0.015

    def ai_update(self, walls, all_tanks, player):
        if not self.alive:
            return

        self.ai_timer += 1
        if self.ai_timer >= self.change_dir_time:
            self.ai_timer = 0
            self.change_dir_time = random.randint(40, 100)
            self.direction = random.choice([UP, DOWN, LEFT, RIGHT])

        dx = dy = 0
        if self.direction == UP:
            dy = -self.speed
        elif self.direction == DOWN:
            dy = self.speed
        elif self.direction == LEFT:
            dx = -self.speed
        else:
            dx = self.speed

        if dx != 0 or dy != 0:
            self.move(dx, dy, walls, all_tanks)

        if random.random() < self.shoot_prob:
            self.shoot()

class Base:
    """玩家基地（老鹰）"""
    def __init__(self, x, y):
        self.rect = pygame.Rect(x, y, 40, 40)
        self.alive = True

    def draw(self, surface):
        if self.alive:
            pygame.draw.rect(surface, BLUE, self.rect)
            # 画个老鹰标志（简化为星形）
            cx, cy = self.rect.center
            pygame.draw.circle(surface, YELLOW, (cx, cy), 12)
            pygame.draw.polygon(surface, BLACK, [(cx, cy-8), (cx-3, cy-2), (cx-8, cy-2), (cx-4, cy+3), (cx-6, cy+8), (cx, cy+5), (cx+6, cy+8), (cx+4, cy+3), (cx+8, cy-2), (cx+3, cy-2)])

def create_walls():
    """创建砖墙和钢墙（基地周围）"""
    walls = []
    # 外围砖墙
    for i in range(20):
        walls.append(Wall(i*40, 0))           # 上边
        walls.append(Wall(i*40, 560))         # 下边
    for i in range(1, 14):
        walls.append(Wall(0, i*40))           # 左边
        walls.append(Wall(760, i*40))         # 右边

    # 内部障碍砖墙
    for x in [200, 240, 280, 320, 440, 480, 520, 560]:
        walls.append(Wall(x, 200))
    for y in [120, 160, 200]:
        walls.append(Wall(360, y))

    # 基地周围的钢墙（不可破坏）
    base_x, base_y = 360, 520
    steel_positions = [(base_x-40, base_y), (base_x+40, base_y),
                       (base_x-40, base_y-40), (base_x, base_y-40), (base_x+40, base_y-40)]
    for pos in steel_positions:
        walls.append(Wall(pos[0], pos[1], destructible=False))

    return walls

def draw_ui(player, state):
    """绘制生命值和游戏状态"""
    lives_text = font.render(f"Lives: {player.lives}", True, WHITE)
    screen.blit(lives_text, (10, 10))

    if state == STATE_GAME_OVER:
        text = font.render("GAME OVER - Press R to Restart", True, RED)
        screen.blit(text, (SCREEN_WIDTH//2 - 200, SCREEN_HEIGHT//2))
    elif state == STATE_VICTORY:
        text = font.render("VICTORY! - Press R to Restart", True, GREEN)
        screen.blit(text, (SCREEN_WIDTH//2 - 180, SCREEN_HEIGHT//2))

def reset_game():
    """重置游戏状态"""
    walls = create_walls()
    player = PlayerTank(360, 480)
    enemies = [
        EnemyTank(100, 80),
        EnemyTank(300, 80),
        EnemyTank(500, 80),
        EnemyTank(200, 160),
        EnemyTank(600, 160)
    ]
    base = Base(360, 520)
    return walls, player, enemies, base, STATE_PLAYING

def main():
    walls, player, enemies, base, game_state = reset_game()
    all_tanks = [player] + enemies

    running = True
    while running:
        clock.tick(FPS)

        # 事件处理
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_r and game_state != STATE_PLAYING:
                    walls, player, enemies, base, game_state = reset_game()
                    all_tanks = [player] + enemies

        if game_state == STATE_PLAYING:
            # 玩家输入
            keys = pygame.key.get_pressed()
            player.handle_input(keys, walls, all_tanks)

            # 敌人AI
            for enemy in enemies:
                enemy.ai_update(walls, all_tanks, player)

            # 更新子弹
            player.update_bullets(walls, enemies, player, base)
            for enemy in enemies:
                enemy.update_bullets(walls, enemies, player, base)

            # 移除死亡敌人
            enemies = [e for e in enemies if e.alive]
            all_tanks = [player] + enemies

            # 检查玩家死亡与重生
            if not player.alive and player.lives > 0:
                player.lives -= 1
                if player.lives > 0:
                    # 重生
                    player.alive = True
                    player.x, player.y = 360, 480
                    player.bullets.clear()
                    player.cooldown = 0
                else:
                    game_state = STATE_GAME_OVER

            # 检查基地是否被摧毁
            if not base.alive:
                game_state = STATE_GAME_OVER

            # 检查胜利（敌人全灭）
            if len(enemies) == 0:
                game_state = STATE_VICTORY

        # 绘制
        screen.fill(BLACK)
        for wall in walls:
            wall.draw(screen)
        base.draw(screen)
        player.draw(screen)
        for enemy in enemies:
            enemy.draw(screen)
        draw_ui(player, game_state)

        pygame.display.flip()

    pygame.quit()
    sys.exit()

if __name__ == "__main__":
    main()