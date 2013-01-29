
@implementation OJObject

+ (id) alloc
{
    return $oj_class_createInstance(this);
}

+ (BOOL) instancesRespondToSelector:(SEL)aSelector
{
    return $oj_class_respondsToSelector(this, aSelector);
}

- (id) init { /* Empty */ }


- (id) mutableCopy { }
- (id) copy { }

- (id) performSelector:(SEL)aSelector { $oj_msgSend(self, aSelector); }
- (id) performSelector:(SEL)aSelector withObject:(id)object { $oj_msgSend(self, aSelector, object); }
- (id) performSelector:(SEL)aSelector withObject:(id)object1 withObject:(id)object2 { $oj_msgSend(self, aSelector, object1, object2); }

@end
