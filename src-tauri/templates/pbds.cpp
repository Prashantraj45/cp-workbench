#include <bits/stdc++.h>
#include <ext/pb_ds/assoc_container.hpp>
#include <ext/pb_ds/tree_policy.hpp>
using namespace std;
using namespace __gnu_pbds;

// Order statistics tree: supports order_of_key and find_by_order
typedef tree<int, null_type, less<int>, rb_tree_tag, tree_order_statistics_node_update> ordered_set;

// Hash map with custom hash
struct custom_hash {
    size_t operator()(uint64_t x) const {
        x = (x ^ (x >> 30)) * 0xbf58476d1ce4e5b9ULL;
        x = (x ^ (x >> 27)) * 0x94d049bb133111ebULL;
        return x ^ (x >> 31);
    }
};
typedef gp_hash_table<int, int, custom_hash> hash_map;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);

    ordered_set s;
    // s.insert(x) — insert x
    // s.order_of_key(x) — number of elements < x
    // *s.find_by_order(k) — k-th element (0-indexed)

    return 0;
}
