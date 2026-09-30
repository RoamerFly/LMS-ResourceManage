"""Production HTTP API with an isolated SQLite database for browser regressions."""
from pathlib import Path
import socket
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.dont_write_bytecode = True
from services import db

test_dir = Path(sys.argv[1]).resolve()
assert test_dir.name.startswith('lms-sheet-native-')
db.DB_PATH = str(test_dir / 'test-data.db')
db.get_base_dir = lambda: str(test_dir)
db.init_database()
with db.get_connection() as conn:
    if not conn.execute('SELECT 1 FROM employees').fetchone():
        conn.executescript("""
            UPDATE departments SET name='生产部' WHERE id=1;
            INSERT INTO employees(id,name,gender,dept_id,sub_dept_id) VALUES
                (1,'张三','男',1,1),(2,'李四','女',1,1);
            INSERT INTO models(id,model_no) VALUES(1,'型号1');
            INSERT INTO orders(id,order_no,year,month) VALUES(1,'A001',2026,9);
            INSERT INTO order_models(order_id,model_id) VALUES(1,1);
            INSERT INTO model_prices(model_id,sub_dept_id,unit_price) VALUES(1,1,2.5);
            INSERT INTO work_records(year,month,order_id,model_id,emp_id,quantity,line_id) VALUES
                (2026,9,1,1,1,1,1),(2026,9,1,1,2,2,1);
        """)
        conn.executemany('INSERT INTO app_settings(key,value) VALUES(?,?)',
                         [('globalYear','2026'),('globalMonth','9'),('sidebar-width','220')])

from api_server import app
import uvicorn

listener = socket.socket()
listener.bind(('127.0.0.1', int(sys.argv[2]) if len(sys.argv) > 2 else 0))
(test_dir / 'api-port.txt').write_text(str(listener.getsockname()[1]))
uvicorn.Server(uvicorn.Config(app, log_level='error')).run(sockets=[listener])
