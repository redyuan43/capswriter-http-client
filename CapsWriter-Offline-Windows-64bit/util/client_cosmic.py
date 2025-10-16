from config import ClientConfig as Config
from asyncio import Queue, AbstractEventLoop
import sounddevice as sd
import sys
from pathlib import Path
from typing import List, Union

from rich.console import Console 
from rich.theme import Theme
my_theme = Theme({'markdown.code':'cyan', 'markdown.item.number':'yellow'})
console = Console(highlight=False, soft_wrap=False, theme=my_theme)


class Cosmic:
    """
    闁活潿鍔嬬粩瀛樼▔?class 閻庢稒锚閸嬪秹妫侀埀顒傛啺娴ｈ姤纭舵俊顖椻偓铏仴閻犱礁娼″Λ鍫曟儍閸曨偄缍侀梺鎻掔箰閳ь剛銆嬬槐婵嬪川閽樺鍊冲☉?Cosmic
    """
    on = False
    queue_in: Queue
    loop: Union[None, AbstractEventLoop] = None
    audio_files = {}
    stream: Union[None, sd.InputStream] = None
    kwd_list: List[str] = []
    api_mode = getattr(Config, 'api_mode', 'optimize')
