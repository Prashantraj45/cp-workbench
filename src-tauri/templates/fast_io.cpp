#include <bits/stdc++.h>
using namespace std;

namespace fastio {
    inline int read_int() {
        int x = 0, f = 1;
        char c = getchar_unlocked();
        while (c < '0' || c > '9') { if (c == '-') f = -1; c = getchar_unlocked(); }
        while (c >= '0' && c <= '9') { x = x * 10 + c - '0'; c = getchar_unlocked(); }
        return x * f;
    }
    inline void write_int(int x) {
        if (x < 0) { putchar_unlocked('-'); x = -x; }
        if (x > 9) write_int(x / 10);
        putchar_unlocked('0' + x % 10);
    }
}

int main() {



    return 0;
}
