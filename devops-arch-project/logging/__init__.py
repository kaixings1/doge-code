"""
日志服务模块，提供统一的日志配置和获取能力
"""
import logging
import os
from logging.handlers import RotatingFileHandler
from common.utils import ensure_dir

class LoggerService:
    _instance = None
    
    def __new__(cls, log_dir: str = "logs", log_level: int = logging.INFO):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._init_logger(log_dir, log_level)
        return cls._instance
    
    def _init_logger(self, log_dir: str, log_level: int) -> None:
        """初始化日志配置：同时支持控制台输出和文件轮转存储"""
        ensure_dir(log_dir)
        self.logger = logging.getLogger("app_logger")
        self.logger.setLevel(log_level)
        
        # 控制台日志处理器
        console_handler = logging.StreamHandler()
        console_handler.setLevel(log_level)
        console_formatter = logging.Formatter(
            "[%(asctime)s] [%(levelname)s] %(message)s"
        )
        console_handler.setFormatter(console_formatter)
        
        # 文件日志处理器（自动轮转，单文件最大10MB，最多保留5个备份）
        file_handler = RotatingFileHandler(
            filename=os.path.join(log_dir, "app.log"),
            maxBytes=10*1024*1024,
            backupCount=5,
            encoding="utf-8"
        )
        file_handler.setLevel(log_level)
        file_formatter = logging.Formatter(
            "[%(asctime)s] [%(levelname)s] [%(module)s:%(lineno)d] %(message)s"
        )
        file_handler.setFormatter(file_formatter)
        
        self.logger.addHandler(console_handler)
        self.logger.addHandler(file_handler)
    
    def get_logger(self) -> logging.Logger:
        """获取全局日志实例"""
        return self.logger

# 全局单日志实例，全项目可直接导入使用
logger = LoggerService().get_logger()
