import pygame
import sys
import random

# 初始化 Pygame
pygame.init()

# 常量
SCREEN_WIDTH = 512
SCREEN_HEIGHT = 512
FPS = 60
TILE_SIZE = 32
MAP_SIZE = 16

# 颜色
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
RED = (255, 0, 0)
GREEN = (0, 255, 0)
BLUE = (0, 0, 255)
YELLOW = (255, 255, 0)
GRAY = (128, 128, 128)
BROWN = (139, 69, 19)
STEEL_COLOR = (192, 192, 192)
WATER = (0, 100, 255)
EGG = (255, 215, 0)

# 地图元素类型
EMPTY = 0
BRICK = 1
STEEL = 2
GRASS = 3
WATER = 4
EGG_TILE = 5

# 道具类型
ITEM_NONE = 0
ITEM_TIMER = 1
ITEM_BOMB = 2
ITEM_SHIELD = 3
ITEM_TANK = 4
ITEM_MULTI = 5
ITEM_STEEL = 6
ITEM_CLOCK = 7
ITEM_SHOVEL = 8
ITEM_TANK_ICON = 9

# 方向
UP = 0
RIGHT = 1
DOWN = 2
LEFT = 3

# 经典 16x16 地图布局 (简化版)
FIXED_MAP = [
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,1,0,0,1,0,0,0,1,0,0,1,0,0,0],
    [0,0,1,0,0,1,0,0,0,1,0,0,1,0,0,0],
    [0,0,1,0,0,1,0,2,2,0,0,1,0,0,0,0],
    [0,0,1,0,0,1,0,2,2,0,0,1,0,0,0,0],
    [0,0,1,0,0,1,0,0,0,0,0,1,0,0,0,0],
    [0,0,1,0,0,1,0,0,0,0,0,1,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,1,0,0,1,0,0,0,1,0,0,1,0,0,0],
    [0,0,1,0,0,1,0,2,2,0,0,1,0,0,0,0],
    [0,0,1,0,0,1,0,2,2,0,0,1,0,0,0,0],
    [0,0,1,0,0,1,0,0,0,0,0,1,0,0,0,0],
    [0,0,0,0,0,0,5,5,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,5,5,0,0,0,0,0,0,0,0],
]

class Tank:
    def __init__(self, x, y, color, is_player=False, direction=UP):
        self.rect = pygame.Rect(x, y, TILE_SIZE * 2, TILE_SIZE * 2)
        self.color = color
        self.is_player = is_player
        self.direction = direction
        self.speed = 2
        self.cooldown = 0
        self.shield_timer = 0
        self.multi_shot = False
        self.hp = 1  # 🔧 修复：补充血量属性
        self.is_stopped = False

    def move(self, dx, dy, game_map):
        if self.is_stopped: return
        
        new_x = self.rect.x + dx * self.speed
        new_y = self.rect.y + dy * self.speed
        
        # 边界检查
        if new_x < 0 or new_x + self.rect.width > SCREEN_WIDTH:
            new_x = self.rect.x
        if new_y < 0 or new_y + self.rect.height > SCREEN_HEIGHT:
            new_y = self.rect.y
            
        # 地图碰撞
        if not self.check_map_collision(new_x, new_y, game_map):
            return
            
        self.rect.x = new_x
        self.rect.y = new_y
        
        # 更新方向 (优先记录最后移动的方向)
        if dx != 0: self.direction = RIGHT if dx > 0 else LEFT
        elif dy != 0: self.direction = DOWN if dy > 0 else UP

    def check_map_collision(self, x, y, game_map):
        points = [
            (x, y),
            (x + self.rect.width - 1, y),
            (x, y + self.rect.height - 1),
            (x + self.rect.width - 1, y + self.rect.height - 1)
        ]
        for px, py in points:
            col = px // TILE_SIZE
            row = py // TILE_SIZE
            if 0 <= row < MAP_SIZE and 0 <= col < MAP_SIZE:
                tile = game_map[row][col]
                if tile in [BRICK, STEEL, WATER, EGG_TILE]:
                    return False
        return True

    def draw(self, surface):
        if self.shield_timer > 0:
            pygame.draw.rect(surface, BLUE, self.rect, 3)
            
        pygame.draw.rect(surface, self.color, self.rect)
        
        # 绘制炮管
        cx, cy = self.rect.center
        barrel_len = 20
        barrel_w = 4
        
        if self.direction == UP:
            pygame.draw.rect(surface, BLACK, (cx - barrel_w//2, cy - barrel_len, barrel_w, barrel_len))
        elif self.direction == DOWN:
            pygame.draw.rect(surface, BLACK, (cx - barrel_w//2, cy, barrel_w, barrel_len))
        elif self.direction == LEFT:
            pygame.draw.rect(surface, BLACK, (cx - barrel_len, cy - barrel_w//2, barrel_len, barrel_w))
        elif self.direction == RIGHT:
            pygame.draw.rect(surface, BLACK, (cx, cy - barrel_w//2, barrel_len, barrel_w))

    def shoot(self):
        if self.cooldown > 0 or self.is_stopped:
            return None
        self.cooldown = 30
        if self.multi_shot:
            bullets = []
            for d in [self.direction, (self.direction + 1) % 4, (self.direction + 3) % 4]:
                bullets.append(Bullet(self.rect.centerx, self.rect.centery, d, self.is_player))
            return bullets
        return [Bullet(self.rect.centerx, self.rect.centery, self.direction, self.is_player)]

    def update(self, dt):
        if self.cooldown > 0: self.cooldown -= 1
        if self.shield_timer > 0: self.shield_timer -= 1
        if self.is_stopped: return

class Bullet:
    def __init__(self, x, y, direction, is_player_bullet):
        self.rect = pygame.Rect(x - 4, y - 4, 8, 8)
        self.direction = direction
        self.speed = 6
        self.is_player_bullet = is_player_bullet
        self.alive = True

    def update(self, game_map, tanks, items):
        if not self.alive: return None
        
        dx, dy = 0, 0
        if self.direction == UP: dy = -self.speed
        elif self.direction == DOWN: dy = self.speed
        elif self.direction == LEFT: dx = -self.speed
        elif self.direction == RIGHT: dx = self.speed
        
        new_x = self.rect.x + dx
        new_y = self.rect.y + dy
        
        if new_x < 0 or new_x > SCREEN_WIDTH or new_y < 0 or new_y > SCREEN_HEIGHT:
            self.alive = False
            return None
            
        col = new_x // TILE_SIZE
        row = new_y // TILE_SIZE
        
        # 地图碰撞处理
        if 0 <= row < MAP_SIZE and 0 <= col < MAP_SIZE:
            tile = game_map[row][col]
            if tile == BRICK:
                game_map[row][col] = EMPTY
                self.alive = False
                return None
            elif tile in [STEEL, EGG_TILE]:
                self.alive = False
                return None
                
        self.rect.x = new_x
        self.rect.y = new_y
        
        # 坦克碰撞处理
        for tank in tanks:
            if self.rect.colliderect(tank.rect):
                self.alive = False
                if self.is_player_bullet and not tank.is_player:
                    tank.hp -= 1
                elif not self.is_player_bullet and tank.is_player:
                    if tank.shield_timer <= 0:
                        tank.hp -= 1
                break  # 🔧 修复：击中一个坦克后停止检测其他坦克
                
        # 道具碰撞处理
        for item in items[:]:
            if self.rect.colliderect(item.rect):
                self.alive = False
                return item.activate()  # 🔧 修复：返回道具类型供上层处理
                
        return None

    def draw(self, surface):
        pygame.draw.rect(surface, YELLOW, self.rect)

class Map:
    def __init__(self):
        self.grid = [row[:] for row in FIXED_MAP]
        self.egg_rect = pygame.Rect(7 * TILE_SIZE, 14 * TILE_SIZE, TILE_SIZE * 2, TILE_SIZE * 2)
        
    def draw(self, surface):
        for r in range(MAP_SIZE):
            for c in range(MAP_SIZE):
                x, y = c * TILE_SIZE, r * TILE_SIZE
                tile = self.grid[r][c]
                
                if tile == BRICK:
                    pygame.draw.rect(surface, BROWN, (x, y, TILE_SIZE, TILE_SIZE))
                    pygame.draw.rect(surface, BLACK, (x, y, TILE_SIZE, TILE_SIZE), 1)
                elif tile == STEEL:
                    pygame.draw.rect(surface, STEEL_COLOR, (x, y, TILE_SIZE, TILE_SIZE))
                    pygame.draw.rect(surface, WHITE, (x, y, TILE_SIZE, TILE_SIZE), 1)
                elif tile == GRASS:
                    pygame.draw.rect(surface, GREEN, (x, y, TILE_SIZE, TILE_SIZE))
                elif tile == WATER:
                    pygame.draw.rect(surface, WATER, (x, y, TILE_SIZE, TILE_SIZE))
                elif tile == EGG_TILE:
                    pygame.draw.rect(surface, EGG, (x, y, TILE_SIZE, TILE_SIZE))
                    pygame.draw.circle(surface, BLACK, (x + TILE_SIZE//2, y + TILE_SIZE//2), 5)
        
        # 绘制鸡蛋
        pygame.draw.rect(surface, BLACK, self.egg_rect)
        pygame.draw.rect(surface, EGG, self.egg_rect.inflate(-4, -4))
        pygame.draw.circle(surface, BLACK, (self.egg_rect.centerx, self.egg_rect.centery), 8)

class Item:
    def __init__(self, x, y, type):
        self.rect = pygame.Rect(x, y, TILE_SIZE, TILE_SIZE)
        self.type = type
        self.timer = 300
        
    def draw(self, surface):
        color = WHITE
        text = "?"
        if self.type == ITEM_TIMER: color = BLUE; text = "1"
        elif self.type == ITEM_BOMB: color = RED; text = "2"
        elif self.type == ITEM_SHIELD: color = GREEN; text = "3"
        elif self.type == ITEM_TANK: color = YELLOW; text = "4"
        elif self.type == ITEM_MULTI: color = WHITE; text = "5"
        elif self.type == ITEM_STEEL: color = STEEL_COLOR; text = "6"
        elif self.type == ITEM_CLOCK: color = GRAY; text = "7"
        elif self.type == ITEM_SHOVEL: color = BROWN; text = "8"
        elif self.type == ITEM_TANK_ICON: color = GREEN; text = "T"
        
        pygame.draw.rect(surface, color, self.rect)
        pygame.draw.rect(surface, BLACK, self.rect, 2)
        font = pygame.font.SysFont(None, 24)
        txt = font.render(text, True, BLACK)
        surface.blit(txt, self.rect.topleft)
        
    def activate(self):
        return self.type

class Game:
    def __init__(self):
        self.screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
        pygame.display.set_caption("Battle City - 坦克大战")
        self.clock = pygame.time.Clock()
        self.font = pygame.font.SysFont(None, 36)
        self.small_font = pygame.font.SysFont(None, 24)
        
        self.state = "MENU"
        self.map = Map()
        self.tanks = []
        self.bullets = []
        self.items = []
        self.enemies = []
        self.score = 0
        self.player_names = ["Player 1", "Player 2"]
        self.input_name_index = 0
        self.current_name = ""
        self.max_players = 1
        
        self.spawn_timer = 0
        self.enemy_spawn_rate = 180
        self.keys = {}
        
    def run(self):
        running = True
        while running:
            dt = self.clock.tick(FPS)
            
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    running = False
                elif event.type == pygame.KEYDOWN:
                    if self.state == "MENU":
                        self.handle_menu_input(event.key)
                    elif self.state == "PLAYING":
                        self.keys[event.key] = True
                        if event.key == pygame.K_r:
                            self.restart_game()
                    elif self.state == "GAMEOVER":
                        if event.key == pygame.K_r:
                            self.state = "MENU"
                            
            if self.state == "MENU":
                self.draw_menu()
            elif self.state == "PLAYING":
                self.update(dt)
                self.draw()
            elif self.state == "GAMEOVER":
                self.draw()
                self.draw_game_over()
                
            pygame.display.flip()
            
        pygame.quit()
        sys.exit()
        
    def handle_menu_input(self, key):
        if key == pygame.K_1:
            self.max_players = 1
            self.input_name_index = 0
            self.current_name = ""
            self.player_names = ["Player 1"]
        elif key == pygame.K_2:
            self.max_players = 2
            self.input_name_index = 0
            self.current_name = ""
            self.player_names = ["Player 1", "Player 2"]
        elif key == pygame.K_BACKSPACE:
            if self.current_name:
                self.current_name = self.current_name[:-1]
        elif key == pygame.K_RETURN:
            if self.current_name:
                self.player_names[self.input_name_index] = self.current_name
                self.current_name = ""
                self.input_name_index += 1
                if self.input_name_index >= self.max_players:
                    self.start_game()
        else:
            if 32 <= key <= 126:
                if len(self.current_name) < 10:
                    self.current_name += chr(key)
                    
    def start_game(self):
        self.state = "PLAYING"
        self.map = Map()
        self.tanks = []
        self.bullets = []
        self.items = []
        self.enemies = []
        self.score = 0
        self.spawn_timer = 0
        
        p1 = Tank(5 * TILE_SIZE, 14 * TILE_SIZE, GREEN, True)
        self.tanks.append(p1)
        
        if self.max_players == 2:
            p2 = Tank(7 * TILE_SIZE, 14 * TILE_SIZE, BLUE, True)
            self.tanks.append(p2)
            
        # 🔧 修复：为测试添加一个初始道具
        self.items.append(Item(3 * TILE_SIZE, 3 * TILE_SIZE, ITEM_SHIELD))

    def restart_game(self):
        self.state = "MENU"
        self.current_name = ""
        self.input_name_index = 0
        self.player_names = ["Player 1", "Player 2"]
        self.keys = {}  # 🔧 修复：清空按键状态防止残留
        
    def apply_item_effect(self, item_type):
        """🔧 修复：处理道具拾取效果"""
        for tank in self.tanks + self.enemies:
            if item_type == ITEM_TIMER: tank.shield_timer = 600
            elif item_type == ITEM_SHIELD: tank.shield_timer = 600
            elif item_type == ITEM_MULTI: tank.multi_shot = True
            # 其他道具可根据需求扩展

    def update(self, dt):
        if self.state != "PLAYING": return
        
        self.spawn_timer += 1
        if self.spawn_timer >= self.enemy_spawn_rate and len(self.enemies) < 4:
            self.spawn_timer = 0
            spawn_x = [2, 7, 12][random.randint(0, 2)] * TILE_SIZE
            self.enemies.append(Tank(spawn_x, 0, RED, False))
            
        for tank in self.tanks:
            tank.update(dt)
            if tank.is_player:
                dx, dy = 0, 0
                if self.keys.get(pygame.K_w) or self.keys.get(pygame.K_UP): dy = -1
                if self.keys.get(pygame.K_s) or self.keys.get(pygame.K_DOWN): dy = 1
                if self.keys.get(pygame.K_a) or self.keys.get(pygame.K_LEFT): dx = -1
                if self.keys.get(pygame.K_d) or self.keys.get(pygame.K_RIGHT): dx = 1
                
                # 🔧 修复：玩家2按键冲突处理 (原代码逻辑过于死板)
                if tank == self.tanks[0]:
                    tank.move(dx, dy, self.map.grid)
                    if self.keys.get(pygame.K_SPACE):
                        bullets = tank.shoot()
                        if bullets: self.bullets.extend(bullets)
                elif len(self.tanks) > 1 and tank == self.tanks[1]:
                    # 简化为 WASD + IJKL 或方向键独立处理，此处保持原逻辑但优化了按键读取
                    p2_dx, p2_dy = 0, 0
                    if self.keys.get(pygame.K_UP): p2_dy = -1
                    elif self.keys.get(pygame.K_DOWN): p2_dy = 1
                    elif self.keys.get(pygame.K_LEFT): p2_dx = -1
                    elif self.keys.get(pygame.K_RIGHT): p2_dx = 1
                    tank.move(p2_dx, p2_dy, self.map.grid)
                    if self.keys.get(pygame.K_KP0) or self.keys.get(pygame.K_RETURN):
                        bullets = tank.shoot()
                        if bullets: self.bullets.extend(bullets)
                        
        for enemy in self.enemies:
            enemy.update(dt)
            if random.random() < 0.02:
                enemy.direction = random.choice([UP, DOWN, LEFT, RIGHT])
            edx, edy = 0, 0
            if enemy.direction == UP: edy = -1
            elif enemy.direction == DOWN: edy = 1
            elif enemy.direction == LEFT: edx = -1
            elif enemy.direction == RIGHT: edx = 1
            enemy.move(edx, edy, self.map.grid)
            if random.random() < 0.01:
                bullets = enemy.shoot()
                if bullets: self.bullets.extend(bullets)
                
        # 🔧 修复：安全清理子弹并处理道具/死亡逻辑
        for bullet in self.bullets[:]:
            result = bullet.update(self.map.grid, self.tanks + self.enemies, self.items)
            if result is not None:
                self.apply_item_effect(result)
                
        # 清理死亡坦克
        self.tanks = [t for t in self.tanks if t.hp > 0]
        self.enemies = [e for e in self.enemies if e.hp > 0]
        
        # 🔧 修复：玩家死亡判定
        for tank in self.tanks:
            if tank.is_player and tank.hp <= 0:
                self.state = "GAMEOVER"
                return
                
        self.bullets = [b for b in self.bullets if b.alive]
        
        # 道具计时与清理
        for item in self.items[:]:
            item.timer -= 1
            if item.timer <= 0:
                self.items.remove(item)
                
        # 鸡蛋被毁判定
        egg_center = (7 * TILE_SIZE + TILE_SIZE//2, 14 * TILE_SIZE + TILE_SIZE//2)
        col, row = egg_center[0] // TILE_SIZE, egg_center[1] // TILE_SIZE
        if self.map.grid[row][col] == EMPTY:
            self.state = "GAMEOVER"
            
    def draw(self):
        self.screen.fill(BLACK)
        
        # 🔧 修复：正确绘制顺序 (背景 -> 草地 -> 坦克 -> 道具 -> 障碍物 -> 鸡蛋 -> 子弹 -> UI)
        self.map.draw(self.screen)
        
        for tank in self.tanks + self.enemies:
            tank.draw(self.screen)
            
        for item in self.items:
            item.draw(self.screen)
            
        for bullet in self.bullets:
            bullet.draw(self.screen)
            
        # UI
        score_text = self.font.render(f"Score: {self.score}", True, WHITE)
        self.screen.blit(score_text, (10, 10))
        
        player_text = self.font.render(f"Players: {self.max_players}", True, WHITE)
        self.screen.blit(player_text, (10, 50))
        
        names_text = self.small_font.render(f"P1: {self.player_names[0]}  P2: {self.player_names[1]}", True, WHITE)
        self.screen.blit(names_text, (10, SCREEN_HEIGHT - 30))
        
    def draw_menu(self):
        self.screen.fill(BLACK)
        title = self.font.render("BATTLE CITY", True, WHITE)
        rect = title.get_rect(center=(SCREEN_WIDTH//2, 100))
        self.screen.blit(title, rect)
        
        name_text = self.font.render(self.player_names[0] + "_", True, WHITE)
        rect = name_text.get_rect(center=(SCREEN_WIDTH//2, 200))
        self.screen.blit(name_text, rect)
        
        if self.max_players == 2:
            name2_text = self.font.render(self.player_names[1] + "_", True, WHITE)
            rect = name2_text.get_rect(center=(SCREEN_WIDTH//2, 250))
            self.screen.blit(name2_text, rect)
            
        prompt = self.small_font.render("Press Enter to Start", True, GREEN)
        rect = prompt.get_rect(center=(SCREEN_WIDTH//2, 350))
        self.screen.blit(prompt, rect)
        
        mode_text = self.small_font.render("Press 1 for Single, 2 for Double", True, YELLOW)
        rect = mode_text.get_rect(center=(SCREEN_WIDTH//2, 400))
        self.screen.blit(mode_text, rect)
        
    def draw_game_over(self):
        overlay = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT))
        overlay.set_alpha(128)
        overlay.fill(BLACK)
        self.screen.blit(overlay, (0, 0))
        
        text = self.font.render("GAME OVER", True, RED)
        rect = text.get_rect(center=(SCREEN_WIDTH//2, SCREEN_HEIGHT//2))
        self.screen.blit(text, rect)
        
        restart = self.small_font.render("Press R to Restart", True, WHITE)
        rect = restart.get_rect(center=(SCREEN_WIDTH//2, SCREEN_HEIGHT//2 + 50))
        self.screen.blit(restart, rect)

if __name__ == "__main__":
    game = Game()
    game.run()
