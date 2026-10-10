import sys
sys.path.insert(0, 'D:/nova启画/novacanvas/web/backend')
from host.ae_script_builder import build_ae_script

script = build_ae_script(
    comp_name='TEST', width=1920, height=1080, fps=30, duration_sec=10.0,
    layers=[
        {'role': 'title', 'text': 'A', 'in': 0, 'out': 1},
        {'role': 'title', 'text': 'B', 'in': 1, 'out': 2},
        {'role': 'card_data', 'text': 'C', 'in': 0, 'out': 1},
    ],
)
print('CARD_DATA_01 in script:', 'CARD_DATA_01' in script)
print('s.name = "CARD_DATA_01" in script:', 's.name = "CARD_DATA_01"' in script)
print('---script---')
print(script)